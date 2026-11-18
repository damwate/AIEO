import subprocess, hashlib, json, os
os.chdir('d:/YotinGarden/AI-Image-Service')
C = '3aacd6ffafe4b2382bdd296bc5f57acc8e1f9914'
d = 'docs/review/20261118_p0p1'
raw = subprocess.check_output(['git', 'cat-file', 'blob', C + ':' + d + '/MANIFEST.json'])
m = json.loads(raw)
print('contract_version=', m['contract_version'])
print('reviewed_commit=', m['reviewed_commit'])
print('baseline_commit=', m['baseline_commit'])
print('files=', len(m['files']))
all_ok = True
for f in m['files']:
    b = subprocess.check_output(['git', 'cat-file', 'blob', C + ':' + f['path']])
    sha_ok = hashlib.sha256(b).hexdigest() == f['sha256']
    size_ok = len(b) == f['bytes']
    all_ok = all_ok and sha_ok and size_ok
    print(f['path'].split('/')[-1], 'sha', 'OK' if sha_ok else 'FAIL',
          'size', 'OK' if size_ok else 'FAIL', len(b))
print('ALL_OK=', all_ok)
