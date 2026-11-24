#!/usr/bin/env python3
"""2K 默认验证：直连供应商档位验证 + 服务工作流烟测。
在 220/221 宿主机运行（内部 docker exec 进 api 容器执行网络部分）。
用法: python3 verify-2k.py [api_container_name]   默认 ai-image-service-api-1
"""
import json, struct, subprocess, sys, time, uuid

API_CONTAINER = sys.argv[1] if len(sys.argv) > 1 else 'ai-image-service-api-1'

INNER_DIRECT = r'''
import json, struct, sys
from curl_cffi import requests
cfg = json.load(open('/run/secrets/ai-provider.json'))
out = []
for v in cfg.get('vendors', []):
    if (v.get('adapter') or v.get('provider')) != 'openai_compat':
        continue
    if str(v.get('size') or '').strip().lower() == 'auto':
        continue  # 档位验证只针对已配置具体 size 的供应商
    vid = v.get('vendor_id') or v.get('id')
    base = str(v['base_url']).rstrip('/')
    if base.endswith('/v1'):
        base = base[:-3]
    payload = {'model': v['model'], 'prompt': 'a small modern garden patio, stone path, flower beds, photorealistic',
               'n': 1, 'size': str(v['size']), 'quality': str(v.get('quality') or 'auto'),
               'output_format': str(v.get('output_format') or 'png')}
    try:
        r = requests.post(base + '/v1/images/generations',
                          headers={'Authorization': 'Bearer ' + v['api_key']},
                          json=payload, impersonate='chrome', timeout=180)
        if r.status_code != 200:
            out.append({'vendor': vid, 'size': v['size'], 'http': r.status_code, 'error': r.text[:160]})
            continue
        item = r.json()['data'][0]
        raw = base64.b64decode(item['b64_json']) if 'b64_json' in item else requests.get(
            item['url'], impersonate='chrome', timeout=120).content
        w, h = struct.unpack('>II', raw[16:24])
        out.append({'vendor': vid, 'size': v['size'], 'dims': [w, h], 'bytes': len(raw)})
    except Exception as e:
        out.append({'vendor': vid, 'size': v.get('size'), 'error': repr(e)[:160]})
print('DIRECT-RESULT ' + json.dumps(out))
'''

INNER_SMOKE = r'''
import json, struct, sys, time, uuid
from curl_cffi import requests
AUTH_MODE = __import__('os').getenv('AI_AUTH_MODE', '')
base = 'http://127.0.0.1:8000'
headers = {'X-AI-Dev-User': 'aieo-2k-verify'} if AUTH_MODE.strip().lower() == 'dev' else {}
if not headers:
    print('SMOKE-SKIP 需要 X-API-Key（生产 AUTH 非 dev）；改用库内已有 project key 后再烟测')
    sys.exit(0)
payload = {'source_app': 'aieo-verify', 'client_request_id': 'aieo-2k-' + uuid.uuid4().hex[:12],
           'prompt': 'a small modern garden patio, stone path, flower beds, photorealistic', 'params': {'n': 1}}
r = requests.post(base + '/api/image-jobs', json=payload, headers=headers, impersonate='chrome', timeout=30)
assert r.status_code == 202, (r.status_code, r.text[:200])
jid = r.json()['job_id']
deadline = time.time() + 300
status = None
while time.time() < deadline:
    p = requests.get(base + '/api/image-jobs/' + jid, headers=headers, impersonate='chrome', timeout=30)
    status = p.json().get('status')
    if status in ('succeeded', 'failed', 'cancelled'):
        break
    time.sleep(5)
if status != 'succeeded':
    print('SMOKE-FAIL job=%s status=%s' % (jid, status)); sys.exit(1)
g = requests.get(base + '/api/image-jobs/%s/results/0' % jid, headers=headers, impersonate='chrome', timeout=60)
raw = g.content
w, h = struct.unpack('>II', raw[16:24])
print('SMOKE-RESULT ' + json.dumps({'job': jid, 'dims': [w, h], 'bytes': len(raw)}))
'''


def run_inner(code):
    p = subprocess.run(['docker', 'exec', '-i', API_CONTAINER, 'python3', '-'],
                       input='import base64\n' + code, capture_output=True, text=True, timeout=400)
    if p.returncode != 0:
        print('CONTAINER-ERROR', p.stderr.strip()[:300]); sys.exit(2)
    return p.stdout.strip().splitlines()


print('== 阶段1: 直连供应商档位验证（size 按当前配置原样发送）==')
for line in run_inner(INNER_DIRECT):
    if line.startswith('DIRECT-RESULT '):
        rows = json.loads(line[len('DIRECT-RESULT '):])
        ok = True
        for r in rows:
            dims = r.get('dims')
            if dims and max(dims) >= 1900:
                print(f"  OK   {r['vendor']} size={r['size']} dims={tuple(dims)} bytes={r['bytes']}")
            else:
                ok = False
                print(f"  BAD  {json.dumps(r, ensure_ascii=False)}")
        if not ok:
            sys.exit(1)

print('== 阶段2: 服务工作流烟测 ==')
for line in run_inner(INNER_SMOKE):
    print(' ', line)
    if line.startswith('SMOKE-RESULT '):
        r = json.loads(line[len('SMOKE-RESULT '):])
        if max(r['dims']) >= 1900:
            print(f"SMOKE OK dims={tuple(r['dims'])} job={r['job']}")
        else:
            print('SMOKE BAD dims', r['dims']); sys.exit(1)
    elif line.startswith('SMOKE-FAIL'):
        sys.exit(1)
print('VERIFY DONE')
