import sys

sys.stdout.reconfigure(encoding="utf-8")
src = open("phase1/tools/review_leg_recoll_template.mjs", encoding="utf-8").read()
reps = [
    ("__CONV_UUID__", "6afabbd3-ddec-83e8-afca-8a61cf91694c"),
    ("__MARKER_TEXT__", "【S1-R3 收尾确认】"),
    ("__PREV_REPLY_SHA__", "f90078de4b55755f4d37d93f9ea18ac13c56262d43c25b5171b8ee727bf38a74"),
    ("__SENT_USER_UNIT_KEY__", "missing(发送双验UNCERTAIN)"),
    ("__FAILED_DIR__", "D:/AIEO/phase0/logs/dispatch-2026-11-16T08-40-08"),
    ("__OUT_DIR__", "D:/AIEO/phase0/logs/dispatch-2026-11-16T08-40-08/recoll"),
    ('holder: "review_leg_recoll"', 'holder: "workspace_spec_recoll_r3"'),
]
for k, v in reps:
    assert k in src, "MISS:" + k
    src = src.replace(k, v)
assert "__CONV_UUID__" not in src and "__MARKER_TEXT__" not in src
open("phase0/tools/recoll_workspace_spec_r3.mjs", "w", encoding="utf-8", newline="\n").write(src)
print("derived ok, bytes=", len(src.encode("utf-8")))
