# -*- coding: utf-8 -*-
"""S4 R5 裁定缺口本地复现探针（⑧j 旧数字标注检查覆盖缺口）。
R5 裁定（recoll-2026-11-15T00-37-26-831Z）：⑧j 仅对 24/24 做逐次位置标注检查，
未对 21/21、30/30 同样处理；N4 未测"历史数字在正文裸露出现"情形。
本探针只动内存副本不动仓库文件，复现：delivery 正文追加无历史标注的 30/30 时 ⑧j 仍放行；
对照组：同样位置追加裸露 24/24 时 ⑧j 拦截（证明现有规则仅覆盖 24/24）。
预期：BASELINE=0 fail；V-A(30/30 裸露)=0 fail（缺口复现）；V-B(24/24 裸露)>=1 fail 且含 ⑧j。
"""
import importlib.machinery
import importlib.util
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
FILES = {
    "wf": "basic/WORKFLOW.md",
    "cl": "basic/ACCEPTANCE-CHECKLIST.md",
    "tpl": "basic/templates/acceptance-request.md",
    "st": "basic/tasks/b-20261115-phasec-workflow-stats/steps.md",
    "tb": "basic/tasks/b-20261115-phasec-workflow-stats/task-brief.md",
    "ws": "basic/tasks/b-20261115-phasec-workflow-stats/workflow-stats.md",
    "dl": "basic/tasks/b-20261115-phasec-workflow-stats/delivery.md",
}

def load_checker():
    loader = importlib.machinery.SourceFileLoader("s4cc_probe", str(ROOT / "phase0/tools/s4-consistency-check.py"))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod

def main():
    mod = load_checker()
    texts = {k: (ROOT / p).read_text(encoding="utf-8") for k, p in FILES.items()}
    args = [texts[k] for k in ("wf", "cl", "tpl", "st", "tb", "ws", "dl")]

    ok, fail = mod.run_checks(*args)
    print(f"BASELINE: ok={ok} fail={len(fail)}（预期 0，当前实态 36/36）")
    for f in fail:
        print("  -", f)

    INJ_A = "\n\n（当次一致性核验结果：30/30，全部通过。）"
    args_a = args[:-1] + [texts["dl"] + INJ_A]
    ok_a, fail_a = mod.run_checks(*args_a)
    print(f"V-A 正文追加裸露30/30: ok={ok_a} fail={len(fail_a)}（缺口复现=0 fail 即 ⑧j 放行）")
    for f in fail_a:
        print("  -", f)

    INJ_B = "\n\n（当次一致性核验结果：24/24，全部通过。）"
    args_b = args[:-1] + [texts["dl"] + INJ_B]
    ok_b, fail_b = mod.run_checks(*args_b)
    hit_j = any(f.split(" ")[0].startswith("⑧j") for f in fail_b)
    print(f"V-B 对照追加裸露24/24: ok={ok_b} fail={len(fail_b)}（预期>=1 且命中⑧j，证明现有规则仅覆盖24/24）={hit_j}")
    for f in fail_b:
        print("  -", f)

    reproduced = (len(fail) == 0) and (len(fail_a) == 0) and (len(fail_b) >= 1 and hit_j)
    print(f"GAP_REPRODUCED={reproduced}")

if __name__ == "__main__":
    main()
