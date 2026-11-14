# T-P1-908：证据目录全量脱敏扫描（机器证据生成；比照 905 sec_scan_905.py 先例）
# 范围：证据 worktree 两类目录（disk）+ git HEAD 树同路径（git grep -a -P）
import os, re, subprocess, datetime

EV = 'phase1/logs/t-p1-908-20261114'
DISPATCH_DIRS = [
    d for d in sorted(os.listdir('phase0/logs'))
    if d.startswith('dispatch-2026-11-14T0') and d >= 'dispatch-2026-11-14T05'
]
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
            kind = 'redacted-placeholder(ok)' if REDACT_HINT in frag else 'RAW-SECRET-LEAK'
            hits.append((rid, name, kind, frag[:40]))
    return hits

lines = []
lines.append('scan_id: SEC-SCAN-T-P1-908-001')
lines.append('scanned_at: %s' % datetime.datetime.now().isoformat(timespec='seconds'))
lines.append('scope: (a) working tree of branch feature/T-P1-908-evidence dirs [%s, %s]; (b) same paths inside committed git tree at HEAD (git grep)' % (EV, ', '.join(DISPATCH_DIRS)))
lines.append('rules: R1 service token ait_*; R2 csrf_token field values; R3 AIEO_PLATFORM_ADMIN_PASSWORD assignment; R4 AIEO_SESSION_SECRET assignment; R5 generic password/secret/token string assignments >=16 chars')
lines.append('purpose: machine evidence for T-P1-908 RUN-RECORD sanitization claim; RAW secret leak would BLOCK archiving (brief §7); REDACTED placeholders are expected')
lines.append('')

total_raw = 0
files_scanned = 0
for root_dir in (EV,) + tuple('phase0/logs/' + d for d in DISPATCH_DIRS):
    for dirpath, _, files in os.walk(root_dir):
        for fn in files:
            p = os.path.join(dirpath, fn)
            if not os.path.isfile(p):
                continue
            files_scanned += 1
            try:
                t = open(p, encoding='utf-8', errors='replace').read()
            except Exception:
                continue
            for h in scan_text(p, t):
                lines.append('[%s] rule=%s file=%s fragment=%r' % (h[2], h[0], h[1], h[3]))
                if h[2] == 'RAW-SECRET-LEAK':
                    total_raw += 1

lines.append('')
lines.append('=== git tree scan (HEAD, git grep -a -P per rule; PCRE because POSIX ERE lacks backslash-s) ===')
# （验收第5轮 REJECT 修复，reply 631ddd8d367ce51a：git 树命中必须计入泄漏判定——
# 原实现 git_raw 恒为 0（仅展示 git_hits 不入 total_raw），git 树内的 RAW 泄漏
# 不会触发 LEAK-BLOCKED。改为逐行捕获：-n 输出 path:line:content，
# 含 REDACTED 占位的命中不计 raw（与 disk 侧 scan_text 同语义）。）
for root_dir in (EV,) + tuple('phase0/logs/' + d for d in DISPATCH_DIRS):
    git_hits = 0
    git_raw = 0
    for rid, pat in RULES:
        r = subprocess.run(['git', 'grep', '-a', '-P', '-n', pat, '--', root_dir],
                           capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.strip():
            for ln in r.stdout.strip().splitlines():
                git_hits += 1
                frag = ln.split(':', 2)[-1]
                if REDACT_HINT not in frag:
                    git_raw += 1
                    lines.append('[%s] git-tree file=%s fragment=%r' % (rid, ln.split(':', 1)[0], frag[:40]))
    lines.append('git grep -P hits in %s: %d (raw/unredacted: %d)' % (root_dir, git_hits, git_raw))
    total_raw += git_raw

lines.append('')
lines.append('summary: files_scanned(disk)=%d, raw_secret_hits(total disk+git tree)=%d' % (files_scanned, total_raw))
lines.append('result: %s' % ('LEAK-BLOCKED' if total_raw else 'CLEAN'))
out = 'phase1/logs/t-p1-908-20261114/security-scan.txt'
os.makedirs(os.path.dirname(out), exist_ok=True) if '/' in out else None
open(out, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
print('\n'.join(lines[-4:]))
print('dispatch dirs in scope:', DISPATCH_DIRS)
