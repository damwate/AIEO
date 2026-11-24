#!/usr/bin/env python3
"""2K 证据矩阵（planning R3 MF-01/02）：分供应商×size档位×通道，成对留证。
在 220 宿主机执行：python3 matrix-2k.py   （内部 docker exec 进 api 容器发请求）
输出 JSONL 到 /tmp/matrix-2k.jsonl，再传回查看。"""
import json, subprocess, sys, time

CONTAINER = 'ai-image-service-api-1'
PROBES = []  # (vendor_id, size_value_or_OMIT, channel, note)
SIZES = [('1024x1024', 'A-基线'), ('2048x2048', 'B-像素'), ('2K', 'C-档位串'),
         ('__OMIT__', 'D-不传'), ('auto', 'E-auto')]

INNER = r'''
import json, struct, sys, time, base64
from curl_cffi import requests
probes = json.loads(sys.argv[1])
cfg = json.load(open('/run/secrets/ai-provider.json'))
vmap = {(v.get('vendor_id') or v.get('id')): v for v in cfg.get('vendors', [])}
# 1x1 PNG 作为 edits 参考图
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
for p in probes:
    v = vmap[p['vendor']]
    base = str(v['base_url']).rstrip('/')
    if base.endswith('/v1'):
        base = base[:-3]
    rec = {'vendor': p['vendor'], 'size_sent': p['size'], 'channel': p['channel'],
           'model': v['model'], 'endpoint': '', 'http': None, 'dims': None,
           'bytes': None, 'elapsed_ms': None, 'error_body': None, 'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    t0 = time.time()
    try:
        if p['channel'] == 'generations':
            rec['endpoint'] = base + '/v1/images/generations'
            payload = {'model': v['model'], 'prompt': 'a single potted plant on a wooden table, product photo',
                       'n': 1, 'quality': str(v.get('quality') or 'auto'),
                       'output_format': str(v.get('output_format') or 'png')}
            if p['size'] != '__OMIT__':
                payload['size'] = p['size']
            r = requests.post(rec['endpoint'], headers={'Authorization': 'Bearer ' + v['api_key']},
                              json=payload, impersonate='chrome', timeout=180)
        else:  # edits multipart
            rec['endpoint'] = base + '/v1/images/edits'
            fields = {'model': v['model'], 'prompt': 'place this object in a sunny garden, keep it identical',
                      'n': '1', 'quality': str(v.get('quality') or 'auto'),
                      'output_format': str(v.get('output_format') or 'png')}
            if p['size'] != '__OMIT__':
                fields['size'] = p['size']
            files = [('image[]', 'ref.png', 'image/png', PNG)]
            r = requests.post(rec['endpoint'], headers={'Authorization': 'Bearer ' + v['api_key']},
                              data=fields, files=files, impersonate='chrome', timeout=180)
        rec['http'] = r.status_code
        rec['elapsed_ms'] = int((time.time() - t0) * 1000)
        if r.status_code == 200:
            data = r.json()
            item = (data.get('data') or [{}])[0]
            raw = base64.b64decode(item['b64_json']) if item.get('b64_json') else requests.get(
                item['url'], impersonate='chrome', timeout=120).content
            rec['dims'] = list(struct.unpack('>II', raw[16:24]))
            rec['bytes'] = len(raw)
        else:
            rec['error_body'] = r.text[:300]
    except Exception as e:
        rec['elapsed_ms'] = int((time.time() - t0) * 1000)
        rec['error_body'] = repr(e)[:300]
    print('MATRIX ' + json.dumps(rec, ensure_ascii=False), flush=True)
'''

def main():
    cfg = json.loads(subprocess.run(
        ['docker', 'exec', CONTAINER, 'python3', '-c',
         "import json;print(json.dumps(json.load(open('/run/secrets/ai-provider.json')).get('vendors',[])))"],
        capture_output=True, text=True).stdout)
    targets = []
    for v in cfg:
        vid = v.get('vendor_id') or v.get('id')
        if vid == 'vendor-38a26ea7-3742-4e52-9337-0d25bd5cf408':
            continue  # intelalloc 本次不纳入（R3 裁定）
        if (v.get('adapter') or v.get('provider')) != 'openai_compat':
            continue
        targets.append(vid)
    probes = []
    for vid in targets:
        for size, note in SIZES:
            probes.append({'vendor': vid, 'size': size, 'channel': 'generations', 'note': note})
    # wukong 补 edits 通道关键点（GDC 实际带图路径）
    probes.append({'vendor': 'wukong', 'size': '2K', 'channel': 'edits', 'note': 'C-edits'})
    probes.append({'vendor': 'wukong', 'size': '2048x2048', 'channel': 'edits', 'note': 'B-edits'})
    print(f'targets={targets} probes={len(probes)}', flush=True)
    p = subprocess.Popen(['docker', 'exec', '-i', CONTAINER, 'python3', '-', json.dumps(probes)],
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    p.stdin.write(INNER)
    p.stdin.close()
    n = 0
    for line in p.stdout:
        line = line.strip()
        if line.startswith('MATRIX '):
            print(line)
            n += 1
    p.wait()
    print(f'DONE {n}/{len(probes)}')

if __name__ == '__main__':
    main()
