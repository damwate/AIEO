import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { extractSessionId, submitDispatchMessage } from "./dispatch_options.mjs";
import { readReplySnapshot } from "./inbound_dom.mjs";
import { persistInboundArtifacts } from "./inbound_reply.mjs";

const [input, folder, logDir] = process.argv.slice(2);
const job = JSON.parse(readFileSync(input, "utf8"));
const url = "https://chatgpt.com/c/" + job.fixture_session;
const browser = await chromium.launch({
  ...(process.env.AIEO_CHROME_EXECUTABLE
    ? { executablePath: process.env.AIEO_CHROME_EXECUTABLE }
    : { channel: "chrome" }),
  headless: false,
  args: ["--disable-background-networking"],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 660 } });
  const startUrl = job.wrong_target ? url : job.target_url ?? "https://chatgpt.com/";
  const replyText = "Local fixture reply for " + job.task + " / " + job.round;
  const userKey = "fixture-" + job.seq + ":0:user";
  const assistantKey = "fixture-" + job.seq + ":1:assistant";
  const original = startUrl === "https://chatgpt.com/" ? "" :
    '<p data-content-search-unit-key="prior:0:user">Earlier fixture turn</p>';
  await page.route("**/*", route => {
    if (route.request().url() !== startUrl) return route.abort();
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: '<h1>AIEO local browser fixture</h1><p>Task ' + job.task + ' / ' + job.round
        + '</p>' + original + '<textarea autofocus></textarea><main id="transcript"></main>',
    });
  });
  await page.goto(startUrl);
  await page.evaluate(({ url, userKey, assistantKey, replyText }) => {
    window.fixtureSendCount = 0;
    document.querySelector("textarea").addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      window.fixtureSendCount++;
      history.replaceState(null, "", url);
      const appendUnit = (key) => {
        const element = document.createElement("section");
        element.setAttribute("data-content-search-unit-key", key);
        document.querySelector("#transcript").append(element);
        return element;
      };
      appendUnit(userKey).textContent = event.currentTarget.value;
      const response = document.createElement("div");
      response.setAttribute("data-dil-response", "");
      response.setAttribute("data-dil-message-id", "fixture-response-" + assistantKey);
      response.textContent = replyText;
      appendUnit(assistantKey).append(response);
    });
  }, { url, userKey, assistantKey, replyText });
  await page.locator("textarea").fill(job.brief);
  let intents = 0;
  const send = () => submitDispatchMessage(page, {
    newSession: job.target_session === null,
    targetSessionId: job.target_session,
  }, () => { intents++; });

  if (job.wrong_target) {
    await assert.rejects(send(), /SESSION_TARGET_MISMATCH/);
    assert.equal(intents, 0);
    assert.equal(await page.evaluate(() => window.fixtureSendCount), 0);
    writeFileSync(join(folder, "wrong-target.json"), JSON.stringify({ intents, sends: 0 }));
    await page.screenshot({ path: join(folder, "wrong-target.png") });
  } else {
    await send();
    assert.equal(intents, 1);
    assert.equal(await page.evaluate(() => window.fixtureSendCount), 1);
    assert.equal(extractSessionId(page.url()), job.fixture_session);
    const dispatchDir = "dispatch-fixture-" + job.seq;
    const archive = join(logDir, dispatchDir);
    mkdirSync(archive, { recursive: true });
    writeFileSync(join(archive, "request.txt"), job.brief, "utf8");
    writeFileSync(join(folder, "send-receipt.json"), JSON.stringify({
      state: "SEND_CONFIRMED", dispatch_dir: dispatchDir,
      session_id: job.fixture_session, user_unit_key: userKey,
    }));
    if (job.drop_result) {
      process.exitCode = 2;
    } else {
      const snapshot = await readReplySnapshot(page, userKey);
      assert.equal(snapshot.reply, replyText);
      const evidence = persistInboundArtifacts({
        directory: archive, snapshot, extractedAt: new Date().toISOString(),
      });
      writeFileSync(join(archive, "result.json"), JSON.stringify({
        instance_id: "standard-queue",
        artifact_sha256: evidence.reply.artifact_sha256,
        size_bytes: evidence.reply.size_bytes,
        session_id: job.fixture_session,
        conversation_url: page.url(),
        user_unit_key: userKey,
        completion_checks: {
          browser_intent_once: intents === 1,
          reply_readback: evidence.reply.readback_verified,
          units_readback: evidence.raw_units.readback_verified,
        },
      }));
      await page.screenshot({ path: join(folder, "browser.png") });
    }
  }
} finally {
  await browser.close();
}
