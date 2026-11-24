#!/usr/bin/env bash
# 220/221 生产 ai-provider.json：三家供应商 size 修正为档位值 2K。
# 幂等：已=2K 跳过；备份 .bak-20261123（改动前原始态）永不覆盖。
set -euo pipefail

HOSTS_220=/home/yotin/migration-221/files/home/yotin/AI-Image-Service/.env/ai-provider.json
HOSTS_221=/home/yotin/AI-Image-Service/.env/ai-provider.json

for CFG in "$HOSTS_220" "$HOSTS_221"; do
  [ -f "$CFG" ] || { echo "SKIP (不存在): $CFG"; continue; }
  python3 - "$CFG" <<'PYEOF'
import json, os, shutil, sys
cfg_path = sys.argv[1]
bak = cfg_path + '.bak-20261123'
if not os.path.exists(bak):
    shutil.copy2(cfg_path, bak)  # 保底：万一原始备份缺失，先补一份当前态备份
with open(cfg_path) as f:
    doc = json.load(f)
changed = []
for v in doc.get('vendors', []):
    vid = v.get('vendor_id') or v.get('id') or ''
    if vid == 'vendor-38a26ea7-3742-4e52-9337-0d25bd5cf408':
        continue  # intelalloc 保持 auto
    if v.get('size') == '2K':
        continue
    old = v.get('size')
    v['size'] = '2K'
    changed.append(f"{vid}: {old!r} -> '2K'")
if not changed:
    print(f"ALREADY-2K: {cfg_path}")
    sys.exit(0)
tmp = cfg_path + '.tmp'
with open(tmp, 'w') as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)
os.replace(tmp, cfg_path)
print(f"UPDATED: {cfg_path}")
for c in changed:
    print('  ' + c)
PYEOF
done
echo "DONE"
