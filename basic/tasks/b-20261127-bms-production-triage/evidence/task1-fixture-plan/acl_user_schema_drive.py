# -*- coding: utf-8 -*-
"""user表结构采集驱动：本地读yml凭证→内存拼stdin JSON→scp远端脚本→ssh执行→落盘结果。
注意stdin双用途陷阱：ssh必须执行 python3 /tmp/<脚本>，绝不能用 python3 -（会吃掉JSON stdin）。
用法: python -I acl_user_schema_drive.py --out <json>"""
import argparse
import json
import re
import subprocess
from pathlib import Path

DEV_YML = Path(r"D:/YotinGarden/.worktrees/bms-multi-device-login-acl/acl-server/src/main/resources/config/application-dev.yml")
REMOTE_SRC = Path(r"D:/AIEO/basic/tasks/b-20261127-bms-production-triage/runtime/acl_user_schema_remote.py")
REMOTE_DST = "/tmp/acl_user_schema.py"
KEY = str(Path.home() / ".ssh/yotin_deploy")
SSH_BASE = ["ssh", "-i", KEY, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=10", "root@47.96.67.90"]
FX_NAME = "acl_it_fixture_qywx"
FX_PREFIX = "acl_it_fixture"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    yml = DEV_YML.read_text(encoding="utf-8")
    m = re.search(r"url:\s*jdbc:mysql://([^/:]+):(\d+)/(\w+)", yml)
    username = re.search(r"username:\s*(\S+)", yml).group(1).strip("\"'")
    password = re.search(r"password:\s*(\S+)", yml).group(1).strip("\"'")
    stdin_json = json.dumps({"host": "127.0.0.1", "port": m.group(2), "db": m.group(3),
                             "user": username, "password": password,
                             "fx_name": FX_NAME, "fx_prefix": FX_PREFIX})
    scp = subprocess.run(["scp", "-i", KEY, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
                          "-o", "ConnectTimeout=10", str(REMOTE_SRC), "root@47.96.67.90:" + REMOTE_DST],
                         capture_output=True)
    if scp.returncode != 0:
        raise SystemExit("SCP_FAIL exit=%d stderr=%s" % (scp.returncode, scp.stderr.decode("utf-8", "replace")[:300]))
    ensure = ("test -d /tmp/pylib/pymysql || pip3 install --target /tmp/pylib PyMySQL >/dev/null 2>&1; "
              "PYTHONPATH=/tmp/pylib python3 " + REMOTE_DST)
    proc = subprocess.run(SSH_BASE + [ensure], input=stdin_json.encode("utf-8"), capture_output=True)
    if proc.returncode != 0:
        raise SystemExit("REMOTE_FAIL exit=%d stderr=%s" % (proc.returncode, proc.stderr.decode("utf-8", "replace")[:300]))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(proc.stdout)
    snap = json.loads(proc.stdout.decode("utf-8"))
    print(json.dumps({"columns": len(snap["columns"]), "fx_name_existing": snap["fx_name_existing"],
                      "fx_name_prefix_existing": snap["fx_name_prefix_existing"],
                      "fx_qywx_prefix_existing": snap["fx_qywx_prefix_existing"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
