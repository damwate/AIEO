# S4 问题11 三方核验脚本（b-20261115-phasec-workflow-stats）
# 目的：复核验收方 R1 问题11（判 WORKFLOW v0.3 附录缺编号 11）——
#   本地工作区 / git 对象(5580d4a) / GitHub raw 三方逐字节 sha256 对照 + 附录编号序列提取
# 用法：python -I phase0/tools/s4-appendix-threeway-check.py （在仓库根目录执行）
# 修正记录：初版核验在 R1 整改期完成（结论=三方一致 df5d1f21…4cc，编号 1-12 全在）；
#   本文件为可复跑存档版（R1 整改回填时补建，核验逻辑与当时一致）。
#   R2 问题13 整改：raw 获取失败不再降级为两方比较（three_same 直接 False）；
#   通过条件收紧为三条全过（raw 成功+三方一致+编号严格 1-12），任一失败 sys.exit(1)。
import hashlib, io, re, subprocess, sys

COMMIT = "5580d4aacfc34d89e4ea674cdea0204a7b1d25ac"
PATH = "basic/WORKFLOW.md"
RAW = f"https://raw.githubusercontent.com/damwate/AIEO/{COMMIT}/{PATH}"

def sha(b): return hashlib.sha256(b).hexdigest()

def appendix_ids(b):
    s = b.decode("utf-8")
    ai = s.rfind("v0.2↔v0.3 差异记录")
    tail = s[ai:]
    nxt = tail.find("\n## ", 10)
    sec = tail[:nxt] if nxt > 0 else tail
    return re.findall(r"^\| (\d+) \|", sec, re.M), s.count("## 附录") + s.count("差异记录")

results = {}

# ① 本地工作区（如实记录两种字节形态：工作区原始字节含 CRLF[git autocrlf checkout]；行尾归一后=对象内容）
local = io.open(PATH, "rb").read()
results["本地工作区(原始字节)"] = sha(local)
local_norm = local.replace(b"\r\n", b"\n")
results["本地工作区(行尾归一)"] = sha(local_norm)
crlf_only = local_norm != local and sha(local_norm) != sha(local)

# ② git 对象层（待验收 commit 5580d4a）
r = subprocess.run(["git", "show", f"{COMMIT}:{PATH}"], capture_output=True)
assert r.returncode == 0, f"git show 失败: {r.stderr.decode(errors='replace')[:200]}"
results["git对象 5580d4a"] = sha(r.stdout)

# ③ GitHub raw 直读
r2 = subprocess.run(["curl", "-fsSL", "--max-time", "60", RAW], capture_output=True)
raw_ok = r2.returncode == 0
results["GitHub raw"] = sha(r2.stdout) if raw_ok else None
raw_err = r2.stderr.decode(errors="replace")[:200] if not raw_ok else ""

# 三方对照（归一后口径：对象层与 raw 本身即 LF；raw 获取失败时 three_same 直接判 False，不降级两方比较）
vals = [results["本地工作区(行尾归一)"], results["git对象 5580d4a"]]
if raw_ok: vals.append(results["GitHub raw"])
three_same = raw_ok and len(set(vals)) == 1

ids_local, _ = appendix_ids(local)
ids_local_norm, _ = appendix_ids(local_norm)
if raw_ok:
    ids_raw, _ = appendix_ids(r2.stdout)
else:
    ids_raw = []

print(f"待验收 commit: {COMMIT}")
print(f"检查对象: {PATH} 附录差异记录表")
print(f"① 本地工作区(原始字节,CRLF) sha256 = {results['本地工作区(原始字节)']}")
print(f"① 本地工作区(行尾归一,LF)   sha256 = {results['本地工作区(行尾归一)']}")
print(f"   (说明: 工作区文件经 git autocrlf checkout 为 CRLF, 与 git 对象差异=纯行尾, 内容归一后等价)")
print(f"② git对象层    sha256 = {results['git对象 5580d4a']}")
if raw_ok:
    print(f"③ GitHub raw   sha256 = {results['GitHub raw']}")
else:
    print(f"③ GitHub raw   获取失败: {raw_err}")
print(f"三方逐字节一致: {'PASS' if three_same else 'FAIL'}")
if three_same:
    print(f"三方归一后 sha256 = {vals[0]}")
print(f"附录编号序列(本地) = {ids_local}")
if raw_ok:
    print(f"附录编号序列(raw)  = {ids_raw}")
    print(f"编号1-12全在且无重号: {'PASS' if ids_raw == [str(i) for i in range(1, 13)] else 'FAIL'}")
print()
# R2 问题13 整改：核验通过必须同时满足 ①raw 成功获取（网络失败=核验失败，不降级为两方比较）
# ②三方 SHA 全部存在且一致 ③编号序列严格等于 1-12；任一失败 exit(1)，不返回成功退出码。
ids_strict = [str(i) for i in range(1, 13)]
cond_raw = raw_ok
cond_same = three_same
cond_ids = ids_local == ids_strict and (not raw_ok or ids_raw == ids_strict)
all_pass = cond_raw and cond_same and cond_ids
print(f"条件①raw获取成功: {'PASS' if cond_raw else 'FAIL'}")
print(f"条件②三方SHA全存在且一致: {'PASS' if cond_same else 'FAIL'}")
print(f"条件③编号严格=1-12: {'PASS' if cond_ids else 'FAIL'}")
print("结论: " + (
    "核验通过（三方逐字节一致+编号1-12全在）"
    if all_pass
    else "核验未通过（存在实质差异/raw获取失败/编号异常），须进一步排查"
))
sys.exit(0 if all_pass else 1)
