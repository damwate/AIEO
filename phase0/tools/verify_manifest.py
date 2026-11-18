import subprocess, hashlib, json, os
os.chdir('d:/YotinGarden/AI-Image-Service')
C = '9ebb68697d0e0e5ab0c5d603ccd98aaa96f52733'
d = 'docs/review/20261118_p0p1'
raw = subprocess.check_output(['git', 'cat-file', 'blob', C + ':' + d + '/MANIFEST.json'])
m = json.loads(raw)
print('manifest_files=', len(m['files']))
all_ok = True
for f in m['files']:
    b = subprocess.check_output(['git', 'cat-file', 'blob', C + ':' + f['path']])
    sha_ok = hashlib.sha256(b).hexdigest() == f['sha256']
    size_ok = len(b) == f['bytes']
    all_ok = all_ok and sha_ok and size_ok
    print(f['path'].split('/')[-1], 'sha', 'OK' if sha_ok else 'FAIL',
          'size', 'OK' if size_ok else 'FAIL', len(b))
print('ALL_OK=', all_ok)
