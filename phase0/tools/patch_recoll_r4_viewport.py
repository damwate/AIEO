import sys

sys.stdout.reconfigure(encoding="utf-8")
p = "phase0/tools/recoll_workspace_spec_r4.mjs"
s = open(p, encoding="utf-8").read()
anchor = "  log(`页面就位: ${page.url()}`);\n"
assert anchor in s, "anchor miss"
inject = (
    anchor
    + "  // L-021 第3条前置升级：会话轮次增多后虚拟化只物化末 2 unit → 先拉高视口强制全量物化\n"
    + '  cdp = await ctx.newCDPSession(page);\n'
    + '  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 20000, deviceScaleFactor: 1, mobile: false }).catch(() => {});\n'
    + '  log("视口已拉高 1920x20000（前置全量物化）");\n'
)
assert "视口已拉高" not in s, "already patched"
s = s.replace(anchor, inject, 1)
open(p, "w", encoding="utf-8", newline="\n").write(s)
print("patched, bytes=", len(s.encode("utf-8")))
