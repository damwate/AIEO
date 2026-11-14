# -*- coding: utf-8 -*-
"""A5 三件套审计（验收第1轮 REJECT 补证，2026-11-14）。

审计对象：executions/ORCH-*/evidence-steps/ 下每个证据组（前缀相同的文件组）。
任务书 §6 证据三件套=stdout/stderr/meta.json；§11 A5 判定条件含"每步三件套齐全"。
输出：triplet-audit.json（组清单+齐全判定+缺失清单），全只读。
"""
import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent  # .../t-p1-908-20261114
EXEC = BASE / "executions"
SUFFIXES = ("-stdout.txt", "-stderr.txt", "-meta.json")


def audit_dir(exec_dir: Path) -> dict:
    ev = exec_dir / "evidence-steps"
    groups: dict[str, dict[str, bool]] = {}
    if ev.is_dir():
        for f in sorted(ev.iterdir()):
            name = f.name
            for suf in SUFFIXES:
                if name.endswith(suf):
                    groups.setdefault(name[: -len(suf)], {})[suf] = True
    items = []
    missing_total = 0
    for g in sorted(groups):
        missing = [s for s in SUFFIXES if not groups[g].get(s)]
        missing_total += len(missing)
        items.append({"group": g, "complete": not missing, "missing": missing})
    # blob 类证据（非三件套形态，如 s9-*.json / dev-done.json）单独列出备查
    others = sorted(p.name for p in ev.iterdir()
                    if p.is_file() and not any(p.name.endswith(s) for s in SUFFIXES)) if ev.is_dir() else []
    return {"execution": exec_dir.name, "groups": items,
            "groups_total": len(items), "groups_incomplete": sum(1 for i in items if not i["complete"]),
            "missing_total": missing_total, "non_triplet_files": others}


def main() -> int:
    execs = sorted(d for d in EXEC.iterdir() if d.is_dir() and d.name.startswith("ORCH-"))
    results = [audit_dir(d) for d in execs]
    report = {
        "audited_at_utc": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "scope": f"{len(results)} execution dirs under phase1/logs/t-p1-908-20261114/executions/",
        "criterion": "brief §6 证据三件套 stdout/stderr/meta.json 每组齐全；§11 A5 每步三件套齐全",
        "results": results,
        "summary": {"executions": len(results),
                    "total_groups": sum(r["groups_total"] for r in results),
                    "incomplete_groups": sum(r["groups_incomplete"] for r in results)},
    }
    (BASE / "acceptance" / "triplet-audit.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"TRIPLET-AUDIT executions={report['summary']['executions']} "
          f"groups={report['summary']['total_groups']} incomplete={report['summary']['incomplete_groups']}")
    for r in results:
        for i in r["groups"]:
            if not i["complete"]:
                print(f"  INCOMPLETE {r['execution']}/{i['group']} missing={i['missing']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
