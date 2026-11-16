import sys

sys.stdout.reconfigure(encoding="utf-8")
# 用法：python derive_recoll_generic.py <conv> <marker> <prev_sha> <sent_key> <failed_dir> <out_dir> <driver_path> <holder>
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
assert "__CONV_UUID__" not in src and "__MARKER_TEXT__" not in src
open(driver, "w", encoding="utf-8", newline="\n").write(src)
print("derived:", driver, "bytes=", len(src.encode("utf-8")))
