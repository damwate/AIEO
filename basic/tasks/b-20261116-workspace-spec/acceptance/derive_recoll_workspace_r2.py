import sys

sys.stdout.reconfigure(encoding="utf-8")
src = open("phase1/tools/review_leg_recoll_template.mjs", encoding="utf-8").read()
reps = [
    ("__CONV_UUID__", "6afabbd3-ddec-83e8-afca-8a61cf91694c"),
    ("__MARKER_TEXT__", "【S1-R2 限定复验】"),
    ("__PREV_REPLY_SHA__", "d8a1cbbfda9add20e5055a3214353c51c2a45d47801c3eca27ad4f1d6e80cf7a"),
    ("__SENT_USER_UNIT_KEY__", "fallback-turn-1:0:user"),
    ("__FAILED_DIR__", "D:/AIEO/phase0/logs/dispatch-2026-11-16T08-22-40"),
    ("__OUT_DIR__", "D:/AIEO/phase0/logs/dispatch-2026-11-16T08-22-40/recoll"),
    ('holder: "review_leg_recoll"', 'holder: "workspace_spec_recoll"'),
]
for k, v in reps:
    assert k in src, "MISS:" + k
    src = src.replace(k, v)
assert "__CONV_UUID__" not in src and "__MARKER_TEXT__" not in src
open("phase0/tools/recoll_workspace_spec_r2.mjs", "w", encoding="utf-8", newline="\n").write(src)
print("derived ok, bytes=", len(src.encode("utf-8")))
