# T-P1-905 F-03：证据目录全量脱敏扫描（机器证据生成）
# 范围：分支工作树两证据目录 + git HEAD 树同路径（git grep）
import io, os, re, subprocess, hashlib, datetime

EV = 'phase1/logs/t-p1-905-d1prime-20261114'
DISPATCH = 'phase0/logs/dispatch-2026-11-14T01-13-30'
RULES = [
    ('R1-service-token', r'ait_[A-Za-z0-9\-_]{10,}'),
    ('R2-csrf-token', r'"csrf_token"\s*:\s*"[^"]{8,}"'),
    ('R3-admin-password', r'AIEO_PLATFORM_ADMIN_PASSWORD\s*[=:]\s*\S+'),
    ('R4-session-secret', r'AIEO_SESSION_SECRET\s*[=:]\s*\S+'),
    ('R5-generic-secret-assign', r'(?i)(password|secret|token)"?\s*[=:]\s*"[A-Za-z0-9+/_\-]{16,}"'),
]
REDACT_HINT = 'REDACTED'


def scan_text(name, t):
    hits = []
    for rid, pat in RULES:
        for m in re.finditer(pat, t):
            frag = m.group(0)
            if REDACT_HINT in frag:
                kind = 'redacted-placeholder(ok)'
            else:
                kind = 'RAW-SECRET-LEAK'
            hits.append((rid, name, kind, frag[:40]))
    return hits


lines = []
lines.append('scan_id: SEC-SCAN-T-P1-905-001')
lines.append('scanned_at: %s' % datetime.datetime.now().isoformat(timespec='seconds'))
lines.append('scope: (a) working tree of branch feature/T-P1-905-d1prime dirs [phase1/logs/t-p1-905-d1prime-20261114, phase0/logs/dispatch-2026-11-14T01-13-30]; (b) same paths inside committed git tree at HEAD (git grep)')
lines.append('rules: R1 service token ait_*; R2 csrf_token field values; R3 AIEO_PLATFORM_ADMIN_PASSWORD assignment; R4 AIEO_SESSION_SECRET assignment; R5 generic password/secret/token string assignments >=16 chars')
lines.append('purpose: machine evidence for RUN-RECORD sanitization claim (acceptance finding F-03); REDACTED placeholders are expected')
lines.append('')

total_raw = 0
files_scanned = 0
for root_dir in (EV, DISPATCH):
    for dirpath, _, files in os.walk(root_dir):
        for f in sorted(files):
            p = os.path.join(dirpath, f).replace(os.sep, '/')
            try:
                t = io.open(p, encoding='utf-8', errors='replace').read()
            except Exception as e:
                lines.append('[skip] %s: %s' % (p, e))
                continue
            files_scanned += 1
            for rid, name, kind, frag in scan_text(p, t):
                if kind == 'RAW-SECRET-LEAK':
                    total_raw += 1
                lines.append('[%s] rule=%s file=%s fragment=%r' % (kind, rid, p, frag))

lines.append('')
lines.append('=== git tree scan (HEAD, git grep -a -P per rule; -a forces text mode so REDACTED values visible; PCRE because POSIX ERE lacks backslash-s) ===')
combined = '|'.join(p for _, p in RULES)
for scope in (EV, DISPATCH):
    n_total = 0
    raw = 0
    for rid, pat in RULES:
        r = subprocess.run(['git', 'grep', '-a', '-n', '-P', pat, 'HEAD', '--', scope],
                           capture_output=True, text=True, errors='replace')
        out = r.stdout.strip()
        if r.returncode not in (0, 1):
            lines.append('[git-grep-error] rule=%s rc=%s stderr=%s' % (rid, r.returncode, r.stderr[:120]))
            continue
        n = len(out.splitlines()) if out else 0
        n_total += n
        for ln in (out.splitlines() if out else []):
            if REDACT_HINT not in ln:
                raw += 1
                lines.append('[git-tree-RAW] rule=%s %s' % (rid, ln[:160]))
    total_raw += raw
    lines.append('git grep -P hits in %s: %d (raw/unredacted: %d)' % (scope, n_total, raw))

lines.append('')
lines.append('summary: files_scanned(disk)=%d, raw_secret_hits(total disk+git tree)=%d' % (files_scanned, total_raw))
lines.append('result: %s' % ('CLEAN' if total_raw == 0 else 'LEAK-FOUND'))

out_path = EV + '/security-scan.txt'
io.open(out_path, 'w', encoding='utf-8', newline='').write('\n'.join(lines) + '\n')
data = io.open(out_path, 'rb').read()
io.open(EV + '/security-scan.sha256', 'w', encoding='utf-8', newline='').write(
    hashlib.sha256(data).hexdigest() + '  security-scan.txt\n')
print('\n'.join(lines[-6:]))
print('scan file bytes:', len(data))
