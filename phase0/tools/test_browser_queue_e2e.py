"""Exercise the Standard FIFO in headed Chrome with a fully local routed page."""
import argparse
import json
from pathlib import Path
import platform
import subprocess

import playwright_queue as service

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("evidence_dir", type=Path)
    parser.add_argument("--node", default="node")
    args = parser.parse_args()
    evidence_dir = args.evidence_dir.resolve()
    evidence_dir.mkdir(parents=True)
    logs = evidence_dir / "logs"
    queue = service.Queue(evidence_dir / "ledger")
    sessions = {
        "a": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "b": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "c": "cccccccc-cccc-cccc-cccc-cccccccccccc",
    }
    browser_calls = []
    results = []


    def browser_leg(job, folder, *, fixture_session, wrong_target=False, drop_result=False):
        with (folder / "input.json").open("w", encoding="utf-8") as file:
            json.dump({**job, "fixture_session": fixture_session, "wrong_target": wrong_target,
                       "drop_result": drop_result}, file)
        with (folder / "process.log").open("w", encoding="utf-8") as output:
            return subprocess.run([args.node, str(HERE / "browser-queue-fixture.mjs"), str(folder / "input.json"),
                                   str(folder), str(logs)], stdout=output, stderr=subprocess.STDOUT,
                                  timeout=20).returncode


    def dispatch(job, folder):
        browser_calls.append(job["seq"])
        return browser_leg(job, folder, fixture_session=sessions[job["task"]], drop_result=job["task"] == "c")


    def complete(expected, task):
        result = service.run_once(queue, dispatch, logs)
        assert result["seq"] == expected["seq"] and result["state"] == "COMPLETED", result
        reply = Path(result["evidence"]["reply_path"]).read_text()
        assert reply == f"Local fixture reply for {task} / {expected['round']}", reply
        assert result["evidence"]["session_id"] == sessions[task], result
        results.append(result)
        return result


    a1 = queue.submit("a", "code-review", "r1", "Feature first review")
    a2 = queue.submit("a", "code-review", "r2", "Feature later review")
    b = queue.submit("b", "code-review", "r1", "Independent bug review")
    complete(a1, "a")
    assert queue.set_paused(["a"], paused=True)["pending"][0]["seq"] == a2["seq"]
    assert browser_calls == [a1["seq"]]
    assert complete(b, "b")["target_session"] is None
    queue = service.Queue(evidence_dir / "ledger")
    assert queue.get(a2["seq"])["paused"]
    queue.set_paused(["a"], paused=False)
    assert complete(a2, "a")["target_session"] == sessions["a"]
    assert browser_calls == [a1["seq"], b["seq"], a2["seq"]]

    negative = evidence_dir / "negative"
    negative.mkdir()
    job = {"seq": 90, "task": "a", "round": "wrong-tab", "brief": "Never enter",
           "target_session": sessions["a"], "target_url": "https://chatgpt.com/c/" + sessions["a"]}
    assert browser_leg(job, negative, fixture_session=sessions["b"], wrong_target=True) == 0
    assert json.loads((negative / "wrong-target.json").read_text()) == {"intents": 0, "sends": 0}

    c = queue.submit("c", "code-review", "r1", "Confirmed send before collection interruption")
    d = queue.submit("d", "code-review", "r1", "Next independent job")
    blocked = service.run_once(queue, dispatch, logs)
    assert blocked["seq"] == c["seq"] and blocked["state"] == "BLOCKED", blocked
    assert service.run_once(service.Queue(evidence_dir / "ledger"), dispatch, logs) is None
    assert service.Queue(evidence_dir / "ledger").get(d["seq"])["state"] == "QUEUED"
    assert browser_calls.count(c["seq"]) == 1 and d["seq"] not in browser_calls

    report = {
        "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "scope": "Headed Google Chrome, Playwright, local routed DOM, real SQLite queue; no ChatGPT traffic",
        "python": platform.python_version(),
        "node": subprocess.check_output([args.node, "--version"], text=True).strip(),
        "tests": {
            "pause_without_browser_call": "PASS",
            "unrelated_bug_uses_distinct_session_while_feature_paused": "PASS",
            "resume_returns_to_feature_session_after_queue_restart": "PASS",
            "wrong_tab_zero_intent_and_zero_enter": "PASS",
            "confirmed_send_then_missing_collection_fails_closed_after_restart": "PASS",
        },
        "completed": results,
        "blocked": blocked,
        "browser_call_order": browser_calls,
    }
    (evidence_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"tests": report["tests"], "report": str(evidence_dir / "report.json")}, indent=2))


if __name__ == "__main__":
    main()
