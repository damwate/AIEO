# S4 问题13 失败路径正式测试（b-20261115-phasec-workflow-stats）
# 目的：为 R3 验收方要求"补充失败路径完整执行记录"提供可复跑证据——
#   生成 s4-appendix-threeway-check.py 的无效域名副本 → 实际运行 → 捕获完整输出与退出码 →
#   断言 raw 获取失败判定 FAIL 且退出码=1（不降级、不误报成功）。
# 用法：python -I phase0/tools/s4-appendix-threeway-failpath-test.py （在仓库根目录执行）
# 通过条件：①副本 raw 获取失败输出含「条件①raw获取成功: FAIL」②退出码=1。
# 本脚本自身退出码=测试通过 0 / 失败 1。
import os, subprocess, sys, io

SRC = "phase0/tools/s4-appendix-threeway-check.py"
TMP = "phase0/tools/s4-appendix-threeway-check.__failpath__.py"

src = io.open(SRC, encoding="utf-8").read()
assert "https://raw.githubusercontent.com" in src, "源脚本 raw URL 未找到"
bad = src.replace("https://raw.githubusercontent.com", "https://raw.invalid-invalid-domain.test")
assert bad != src
io.open(TMP, "w", encoding="utf-8", newline="\n").write(bad)

print(f"测试对象: {SRC}")
print(f"失败注入: raw 域名替换为 raw.invalid-invalid-domain.test（副本 {TMP}）")
print(f"运行命令: python -X utf8 -I {TMP}")
print("--- 副本完整输出 ---")
r = subprocess.run([sys.executable, "-X", "utf8", "-I", TMP], capture_output=True)
raw_bytes = r.stdout + r.stderr
try:
    out = raw_bytes.decode("utf-8")
except UnicodeDecodeError:
    out = raw_bytes.decode("gbk", errors="replace")  # 子进程无 -X utf8 时回退 GBK 解码
print(out)
print("--- 副本输出结束 ---")
print(f"实际退出码 = {r.returncode}")

cond_fail_shown = "条件①raw获取成功: FAIL" in out
cond_exit_1 = r.returncode == 1
print(f"通过条件① raw失败判定FAIL: {'PASS' if cond_fail_shown else 'FAIL'}")
print(f"通过条件② 退出码=1: {'PASS' if cond_exit_1 else 'FAIL'}")

os.remove(TMP)
print(f"副本已清理: {not os.path.exists(TMP)}")
print("结论: " + ("失败路径证据闭合（raw获取失败→判定FAIL→exit=1，不降级不误报）" if cond_fail_shown and cond_exit_1 else "失败路径测试未通过"))
sys.exit(0 if cond_fail_shown and cond_exit_1 else 1)
