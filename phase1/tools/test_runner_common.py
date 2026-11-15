# -*- coding: utf-8 -*-
"""runner 公共件（test_17/18/19 的真实子进程自用）：ChatGPT 边界替身安装器。

替身边界声明（S2-R1/R2 复验认可口径）：仅 gpt_dispatch/recoll_driver 两处 ChatGPT
收发/采集调用被替换；Git/Ajv/M1 REST/账本/状态机全真实路径。
"""


def install_double(reply_text, dispatch_root, runtime_dir, recoll_out_dir):
    import json as _json
    from pathlib import Path as _Path
    import subprocess as _sp
    import sys as _sys

    _sys.path.insert(0, str(_Path(__file__).resolve().parent))
    import review_leg as _rl

    real_run = _sp.run

    def _double(cmd, **kw):
        joined = " ".join(map(str, cmd))
        if "recoll_driver.mjs" in joined:
            # A5① 组合证据（会商乙方案）：补采替身=ChatGPT 采集边界
            import hashlib as _h
            rsha = _h.sha256(reply_text.encode("utf-8")).hexdigest()
            out_dir = _Path(recoll_out_dir)
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / "reply.txt").write_text(reply_text, encoding="utf-8")
            (out_dir / "recoll-result.json").write_text(_json.dumps({
                "recollection": True, "located_user_unit_key": "fallback-turn-0:0:user",
                "unit_count": 1, "reply_bytes": len(reply_text.encode("utf-8")),
                "reply_sha256": rsha, "stability": {"stable": True},
                "checks": {"final_stop_button_not_visible": True, "tail_is_assistant": True,
                           "dil_uuid_present": True, "uuid_stable": True, "stable_unit_read": True,
                           "target_range_materialized": True, "not_prev_reply_sha": True},
                "conversation_url": "https://chatgpt.com/c/33333333-4444-4555-8666-777777777777",
            }, ensure_ascii=False), encoding="utf-8")

            class FP:
                returncode = 0
                stdout = b""
                stderr = b""
            return FP()
        if "gpt_dispatch.mjs" in joined:
            droot = _Path(dispatch_root)
            droot.mkdir(parents=True, exist_ok=True)
            n = len(list(droot.glob("dispatch-runner-*"))) + 1
            ddir = droot / ("dispatch-runner-" + str(n))
            ddir.mkdir(parents=True, exist_ok=True)
            cl = [str(a) for a in cmd]
            if "--message-file" in cl:
                mf = _Path(cl[cl.index("--message-file") + 1])
                if mf.is_file():
                    (ddir / "request.txt").write_bytes(mf.read_bytes())
            (ddir / "reply.txt").write_text(reply_text, encoding="utf-8")
            (ddir / "result.json").write_text(_json.dumps({
                "user_unit_key": "fallback-turn-0:0:user", "unit_count": 1,
                "conversation_url": "https://chatgpt.com/c/33333333-4444-4555-8666-777777777777",
                "completion_checks": {"send_double_verify": True}}, ensure_ascii=False),
                encoding="utf-8")

            class FP:
                returncode = 0
                stdout = b""
                stderr = b""
            return FP()
        return real_run(cmd, **kw)

    _rl.subprocess.run = _double
    _rl.RUNTIME_DIR = _Path(runtime_dir)
    _rl.DISPATCH_LOG_DIR = _Path(dispatch_root)
