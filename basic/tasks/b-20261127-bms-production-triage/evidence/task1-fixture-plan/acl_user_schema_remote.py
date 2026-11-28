# -*- coding: utf-8 -*-
"""dev ACL库user表结构只读采集——经ssh执行，凭证从stdin收（不落盘不回显）。
stdin=JSON: {"host":"127.0.0.1","port":8306,"db":"ecog_acl","user":"...","password":"...","fx_name":"...","fx_prefix":"..."}
stdout=JSON: user表全列定义 + fixture命名唯一性预检计数。全程SET SESSION TRANSACTION READ ONLY，零写入。"""
import json
import sys
from datetime import datetime

import pymysql

cfg = json.loads(sys.stdin.read())
conn = pymysql.connect(host=cfg["host"], port=int(cfg["port"]), database=cfg["db"],
                       user=cfg["user"], password=cfg["password"], charset="utf8mb4",
                       cursorclass=pymysql.cursors.DictCursor, connect_timeout=10, read_timeout=30)
out = {"at": datetime.now().isoformat(), "database": "%s:%s/%s" % (cfg["host"], cfg["port"], cfg["db"])}
try:
    with conn.cursor() as cur:
        cur.execute("SET SESSION TRANSACTION READ ONLY")
        cur.execute("SHOW COLUMNS FROM user")
        out["columns"] = [{"field": r["Field"], "type": r["Type"], "null": r["Null"], "key": r["Key"],
                           "default": r["Default"], "extra": r["Extra"]} for r in cur.fetchall()]
        # fixture命名唯一性预检（只读计数，不含真实值）
        cur.execute("SELECT COUNT(*) AS n FROM user WHERE user_name=%s", (cfg["fx_name"],))
        out["fx_name_existing"] = int(cur.fetchone()["n"])
        cur.execute("SELECT COUNT(*) AS n FROM user WHERE user_name LIKE %s", (cfg["fx_prefix"] + "%",))
        out["fx_name_prefix_existing"] = int(cur.fetchone()["n"])
        cur.execute("SELECT COUNT(*) AS n FROM user WHERE qywx_user_id LIKE %s", (cfg["fx_prefix"] + "%",))
        out["fx_qywx_prefix_existing"] = int(cur.fetchone()["n"])
finally:
    conn.close()
print(json.dumps(out, ensure_ascii=False, default=str))
