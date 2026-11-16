import sys

sys.stdout.reconfigure(encoding="utf-8")
# 用法同 derive_recoll_generic.py；额外在页面就位后注入视口拉高（L-021 第3条前置升级）
conv, marker, prev_sha, sent_key, failed_dir, out_dir, driver, holder = sys.argv[1:9]
src = open("phase1/tools/review_leg_recoll_template.mjs", encoding="utf-8").read()
reps = [
    ("__CONV_UUID__", conv),
    ("__MARKER_TEXT__", marker),
    ("__PREV_REPLY_SHA__", prev_sha),
    ("__SENT_USER_UNIT_KEY__", sent_key),
    ("__FAILED_DIR__", failed_dir),
    ("__OUT_DIR__", out_dir),
    ('holder: "review_leg_recoll"', f'holder: "{holder}"'),
]
for k, v in reps:
    assert k in src, "MISS:" + k
    src = src.replace(k, v)
anchor = "  log(`页面就位: ${page.url()}`);\n"
assert anchor in src, "anchor miss"
inject = (
    anchor
    + "  // 会话轮次增多后虚拟化只物化末 2 unit → 前置视口拉高强制全量物化（L-021 第3条）\n"
    + "  cdp = await ctx.newCDPSession(page);\n"
    + '  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 20000, deviceScaleFactor: 1, mobile: false }).catch(() => {});\n'
    + '  log("视口已拉高 1920x20000（前置全量物化）");\n'
)
src = src.replace(anchor, inject, 1)
assert "__CONV_UUID__" not in src and "__MARKER_TEXT__" not in src
open(driver, "w", encoding="utf-8", newline="\n").write(src)
print("derived:", driver, "bytes=", len(src.encode("utf-8")))
