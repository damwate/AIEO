import subprocess, json, os
os.chdir('d:/YotinGarden/AI-Image-Service')
d = 'docs/review/20261118_p0p1'
files = [
    ('REVIEW_BRIEF.md', 'text/plain; charset=utf-8'),
    ('full_test.log', 'text/plain; charset=utf-8'),
    ('baseline_test.log', 'text/plain; charset=utf-8'),
]
m = {
    'contract_version': '1.0',
    'reviewed_commit': '02c9d7a20f4c9b94c50d779ec0acb6383926e005',
    'previous_reviewed_commit': '80fbb23c1dc1a2294051b27beb368daef0fc270e',
    'baseline_commit': 'abd7116e30e17d9669a8551c0985bd09aa8a601a',
    'branch': 'fix/yuanqiao-http1-20261117',
    'repo': 'YotinGarden/AI-Image-Service',
    'files': [],
}
for name, mt in files:
    path = d + '/' + name
    # git hash-object --path applies the same clean filters as commit (CRLF->LF), so the
    # recorded sha256/bytes match what a reader gets from the committed blob.
    blob = subprocess.check_output(['git', 'hash-object', '-w', '--path', path, path]).decode().strip()
    content = subprocess.check_output(['git', 'cat-file', 'blob', blob])
    import hashlib
    m['files'].append({
        'path': path,
        'git_blob_sha1': blob,
        'sha256': hashlib.sha256(content).hexdigest(),
        'bytes': len(content),
        'media_type': mt,
    })
with open(d + '/MANIFEST.json', 'w', encoding='utf-8', newline='\n') as f:
    f.write(json.dumps(m, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(m, ensure_ascii=False, indent=2))
