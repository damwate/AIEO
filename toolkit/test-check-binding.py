#!/usr/bin/env python3
"""check-binding.py 正反例测试矩阵（L-017 第 3 条：检查器自身的验收）。

覆盖：规划 v0.2 十场景 + B4 可复现性 + B5 异常与安全边界。
每个负例断言"命中了哪条规则"（指名拦截，不只查退出码）。
运行：python toolkit/test-check-binding.py  （无需外部依赖，临时 git 仓库自建自清）
"""

import contextlib
import importlib.util
import hashlib
import io as _io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TOOL = str(Path(__file__).with_name("check-binding.py"))
ENV_FIXED = {
    "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
    "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com",
    "GIT_AUTHOR_DATE": "2026-11-15T00:00:00 +0000",
    "GIT_COMMITTER_DATE": "2026-11-15T00:00:00 +0000",
}


def run(cmd, cwd, env_extra=None, check=True):
    env = dict(os.environ)
    env.update(ENV_FIXED)
    if env_extra:
        env.update(env_extra)
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", env=env,
                       shell=(os.name == "nt" and isinstance(cmd, str)))
    if check and p.returncode != 0:
        raise AssertionError(f"命令失败: {cmd}\n{p.stderr}")
    return p


def git(cwd, *args, check=True):
    return run(["git", "-C", str(cwd), *args], cwd=str(cwd), check=check)


class Repo:
    def __init__(self):
        self.dir = tempfile.mkdtemp(prefix="cb-test-")
        git(self.dir, "init", "-q")
        git(self.dir, "config", "user.email", "t@example.com")
        git(self.dir, "config", "user.name", "t")
        self.commit("root")

    def commit(self, msg):
        (Path(self.dir) / "f.txt").write_text(msg, encoding="utf-8")
        git(self.dir, "add", "-A")
        git(self.dir, "commit", "-q", "-m", msg)
        return git(self.dir, "rev-parse", "HEAD").stdout.strip()

    def head(self):
        return git(self.dir, "rev-parse", "HEAD").stdout.strip()

    def cleanup(self):
        subprocess.run(["rmdir", "/s", "/q", self.dir] if os.name == "nt"
                       else ["rm", "-rf", self.dir], capture_output=True, shell=(os.name == "nt"))


def check(repo_dir, *extra):
    p = run([sys.executable, TOOL, *extra], cwd=str(repo_dir), check=False)
    try:
        data = json.loads(p.stdout.strip().splitlines()[-1])
    except Exception:
        raise AssertionError(f"输出非 JSON: rc={p.returncode}\n{p.stdout}\n{p.stderr}")
    return p.returncode, data


class BindingTests(unittest.TestCase):
    def tearDown(self):
        r = getattr(self, "_repo", None)
        if r:
            r.cleanup()

    # ---- 正例 ----
    def test_01_single_commit_parent_is_baseline(self):
        self._repo = r = Repo()
        base = r.head()
        target = r.commit("c1")
        rc, d = check(r.dir, "--baseline", base, "--target", target)
        self.assertEqual(0, rc)
        self.assertEqual("PASS", d["verdict"])

    def test_02_multi_commit_linear_chain(self):
        self._repo = r = Repo()
        base = r.head()
        r.commit("c1")
        target = r.commit("c2")
        rc, d = check(r.dir, "--baseline", base, "--target", target, "--count", "2")
        self.assertEqual(0, rc)
        self.assertEqual("PASS", d["verdict"])
        r2 = [x for x in d["rules"] if x["id"] == "R2"][0]
        self.assertEqual("PASS", r2["verdict"])

    def test_07_backfill_note_pass(self):
        self._repo = r = Repo()
        base = r.head()
        target = r.commit("c1")
        r.commit("backfill-docs")  # 后代=回填
        rc, d = check(r.dir, "--baseline", base, "--target", target,
                      "--backfill-note", "本 commit 为回填，不属验收 diff 范围")
        self.assertEqual(0, rc)
        r5 = [x for x in d["rules"] if x["id"] == "R5"][0]
        self.assertEqual("PASS", r5["verdict"])
        self.assertIn("识别并排除", r5["detail"])

    # ---- 负例（断言具体拦截原因）----
    def test_03_broken_chain_fail(self):
        self._repo = r = Repo()
        base = r.head()  # 申报基线=主链 root
        git(r.dir, "checkout", "--orphan", "orph")
        git(r.dir, "commit", "-q", "-m", "orphan-root")  # 无 parent 的孤儿提交
        target = r.head()
        rc, d = check(r.dir, "--baseline", base, "--target", target)
        self.assertEqual(1, rc)
        self.assertEqual("FAIL", d["verdict"])
        r2 = [x for x in d["rules"] if x["id"] == "R2"][0]
        self.assertEqual("FAIL", r2["verdict"])
        self.assertIn("parent", r2["detail"])  # 断言具体原因：parent ≠ 基线
        self.assertIn(target, r2["commits"])  # 断言被拦截 commit 身份

    def test_04_merge_commit_fail(self):
        self._repo = r = Repo()
        base = r.head()
        main_branch = self._branch()
        c1 = r.commit("c1")
        git(r.dir, "checkout", "-q", "-b", "side", base)
        (Path(r.dir) / "side.txt").write_text("side", encoding="utf-8")
        git(r.dir, "add", "-A")
        git(r.dir, "commit", "-q", "-m", "side-work")
        c2 = r.head()
        git(r.dir, "checkout", "-q", main_branch)
        git(r.dir, "merge", "-q", "--no-ff", "-m", "merge", c2)
        target = r.head()
        rc, d = check(r.dir, "--baseline", base, "--target", target, "--count", "3")
        self.assertEqual(1, rc)
        self.assertEqual("FAIL", d["verdict"])
        r3 = [x for x in d["rules"] if x["id"] == "R3"][0]
        self.assertEqual("FAIL", r3["verdict"])
        self.assertIn("merge", r3["detail"])
        self.assertIn("diff 基线", r3["remediation"])
        self.assertIn(target, r3["commits"])  # 断言被拦截的 merge commit 身份

    def _branch(self):
        p = git(self._repo.dir, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
        return p

    def test_05_count_mismatch_fail(self):
        self._repo = r = Repo()
        base = r.head()
        r.commit("c1")
        target = r.commit("c2")
        rc, d = check(r.dir, "--baseline", base, "--target", target, "--count", "3")
        self.assertEqual(1, rc)
        r1 = [x for x in d["rules"] if x["id"] == "R1"][0]
        self.assertEqual("FAIL", r1["verdict"])
        self.assertIn("申报=3", r1["detail"])
        self.assertIn("实际=2", r1["detail"])

    def test_06_stale_target_without_note_fail(self):
        self._repo = r = Repo()
        base = r.head()
        target = r.commit("c1")
        r.commit("c2")  # target 有后代，未附回填声明
        rc, d = check(r.dir, "--baseline", base, "--target", target)
        self.assertEqual(1, rc)
        r4 = [x for x in d["rules"] if x["id"] == "R4"][0]
        self.assertEqual("FAIL", r4["verdict"])
        self.assertIn("后代", r4["detail"])
        self.assertIn(target, r4["commits"])  # 断言过期申报对象身份

    def test_08_backfill_note_blank_fail(self):
        self._repo = r = Repo()
        base = r.head()
        target = r.commit("c1")
        r.commit("c2")
        rc, d = check(r.dir, "--baseline", base, "--target", target, "--backfill-note", "   ")
        self.assertEqual(1, rc)
        r4 = [x for x in d["rules"] if x["id"] == "R4"][0]
        self.assertEqual("FAIL", r4["verdict"])
        self.assertIn("回填声明", r4["detail"])
        self.assertIn(target, r4["commits"])

    def test_09_missing_object_fail(self):
        self._repo = r = Repo()
        base = r.head()
        rc, d = check(r.dir, "--baseline", base, "--target", "a" * 40)
        self.assertEqual(1, rc)
        r6 = [x for x in d["rules"] if x["id"] == "R6"][0]
        self.assertEqual("FAIL", r6["verdict"])
        self.assertIn("对象不存在", r6["detail"])
        self.assertIn("a" * 40, r6["commits"])

    def test_10a_empty_range_blocked(self):
        self._repo = r = Repo()
        base = r.head()
        rc, d = check(r.dir, "--baseline", base, "--target", base)
        self.assertEqual(2, rc)  # 禁止 PASS
        self.assertEqual("BLOCKED", d["verdict"])
        self.assertEqual("R7", d["rules"][-1]["id"])
        self.assertIn("区间 commit 数==0", d["rules"][-1]["detail"])  # R7 具体原因断言

    def test_10b_empty_range_marked_na_still_blocked(self):
        self._repo = r = Repo()
        base = r.head()
        rc, d = check(r.dir, "--baseline", base, "--target", base, "--mark-na", "无变更轮次")
        self.assertEqual(2, rc)
        self.assertEqual("BLOCKED", d["verdict"])
        self.assertEqual("R7", d["rules"][-1]["id"])
        self.assertIn("区间 commit 数==0", d["rules"][-1]["detail"])  # R7 具体原因断言
        self.assertIn("不适用", d["rules"][-1]["detail"])  # 标注不适用但不得静默跳过

    def test_10c_target_not_descendant_blocked(self):
        self._repo = r = Repo()
        root = r.head()
        r.commit("c1")
        newer = r.commit("c2")  # 申报方向颠倒：baseline=较新 commit，target=祖先 → 空区间
        rc, d = check(r.dir, "--baseline", newer, "--target", root)
        self.assertEqual(2, rc)
        self.assertEqual("BLOCKED", d["verdict"])
        self.assertEqual("R7", d["rules"][-1]["id"])
        self.assertIn("非 baseline 后代", d["rules"][-1]["detail"])

    # ---- B4 可复现性 ----
    def test_b4_deterministic(self):
        self._repo = r = Repo()
        base = r.head()
        r.commit("c1")
        target = r.commit("c2")
        rc1, d1 = check(r.dir, "--baseline", base, "--target", target, "--count", "2")
        rc2, d2 = check(r.dir, "--baseline", base, "--target", target, "--count", "2")
        self.assertEqual(rc1, rc2)
        self.assertEqual(d1, d2)  # 同输入+同对象+同版本 → 判定确定（无时间戳等噪声）

    # ---- B5 异常与安全边界 ----
    def test_b5a_invalid_sha_fail(self):
        self._repo = r = Repo()
        rc, d = check(r.dir, "--baseline", "xyz", "--target", r.head())
        self.assertEqual(1, rc)
        self.assertEqual("FAIL", d["verdict"])
        self.assertIn("输入不合法", d["rules"][0]["detail"])

    def test_b5b_bad_repo_blocked(self):
        self._repo = r = Repo()
        base = r.head()
        target = r.commit("c1")
        rc, d = check(r.dir, "--baseline", base, "--target", target, "--repo", str(Path(r.dir) / "no-such"))
        self.assertEqual(2, rc)
        self.assertEqual("BLOCKED", d["verdict"])
        self.assertIn("无法核验", d["rules"][0]["detail"])

    def test_b5c_readonly_no_mutation(self):
        self._repo = r = Repo()
        base = r.head()
        target = r.commit("c1")
        r.commit("c2")

        def snap(d):
            out = {}
            for root, _, files in os.walk(Path(d) / ".git"):
                for f in files:
                    p = Path(root) / f
                    out[str(p.relative_to(d))] = hashlib.sha256(p.read_bytes()).hexdigest()
            return out

        before = snap(r.dir)
        check(r.dir, "--baseline", base, "--target", target)
        after = snap(r.dir)
        self.assertEqual(before, after)  # 只读承诺：.git 文件清单+内容哈希不变



    # ---- 故障注入（问题1 整改：git 失败→BLOCKED 禁止 PASS 放行）----
    def _load_tool(self):
        spec = importlib.util.spec_from_file_location("check_binding_mod", TOOL)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    def test_b5d_r4_git_fail_blocked(self):
        """R4 rev-list target..HEAD 失败→BLOCKED（不得当作无后代放行 R4 PASS）"""
        self._repo = r = Repo()
        base = r.head()
        target = r.commit("c1")
        mod = self._load_tool()
        real = mod.try_git
        buf = _io.StringIO()
        with contextlib.redirect_stdout(buf):
            def injected(repo_, *args):
                if args == ("rev-list", f"{target}..HEAD"):
                    return (128, "", "fatal: injected failure")
                return real(repo_, *args)
            mod.try_git = injected
            rc = mod.main(["--baseline", base, "--target", target, "--repo", r.dir])
        d = json.loads(buf.getvalue().strip().splitlines()[-1])
        self.assertEqual(2, rc)
        self.assertEqual("BLOCKED", d["verdict"])
        self.assertTrue(any(x["id"] == "RX" and "无法核验" in x["detail"] for x in d["rules"]))
        self.assertFalse(any(x["id"] == "R4" and x["verdict"] == "PASS" for x in d["rules"]))

    def test_b5e_numstat_git_fail_blocked(self):
        """numstat diff 失败→BLOCKED（不得静默返回空证据仍 PASS）"""
        self._repo = r = Repo()
        base = r.head()
        target = r.commit("c1")
        mod = self._load_tool()
        real = mod.try_git
        buf = _io.StringIO()
        with contextlib.redirect_stdout(buf):
            def injected(repo_, *args):
                if args and args[0] == "diff":
                    return (128, "", "fatal: injected numstat failure")
                return real(repo_, *args)
            mod.try_git = injected
            rc = mod.main(["--baseline", base, "--target", target, "--repo", r.dir])
        d = json.loads(buf.getvalue().strip().splitlines()[-1])
        self.assertEqual(2, rc)
        self.assertEqual("BLOCKED", d["verdict"])
        self.assertTrue(any(x["id"] == "RX" for x in d["rules"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
