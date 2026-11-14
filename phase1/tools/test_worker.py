#!/usr/bin/env python3
# T-P1-907 F-003: 最小测试执行 Worker（独立 CLI，Python 标准库，无第三方依赖）
# 依据: docs/phase1/F003-TEST-WORKER-BRIEF.md v0.5 (执行基线 e869d0d, blob 38aa2d9a, DEC-028 开工授权)
# 规划: phase0/logs/dispatch-2026-11-14T02-49-55/reply.txt (GPT-01, 19102B, SHA 2920da04...)
# 设计原则: Worker 只提供事实，不宣布事实是否可信（brief §1）；整体状态由实际执行结果计算，不允许人工覆盖
# 语义: brief §5 五行穷举映射；单条命令失败/超时/启动异常继续执行剩余命令（§10）；输入校验失败一律 BLOCKED（§4/§5）
import argparse, hashlib, json, os, re, subprocess, sys, time
from datetime import datetime, timezone

WORKER_VERSION = '0.1.0'
# 可执行程序显式允许列表（规划 §2.3：首版只开放实际需要的程序，不开放任意 shell 入口；
# sh/bash/cmd/powershell 等包装器不在列表内，从结构上禁止 shell=True/shell 字符串执行）
EXEC_ALLOWLIST = {'node', 'node.exe', 'python', 'python.exe', 'python3', 'python3.exe', 'git', 'git.exe'}
MAX_TIMEOUT_SECONDS = 600
SHA_RE = re.compile(r'^[0-9a-f]{40}$')
CMD_ID_RE = re.compile(r'^command-\d{3,}$')
EXEC_ID_RE = re.compile(r'^EXEC-\d+$')


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def fail_blocked(msg):
    # BLOCKED：Worker 自身无法启动或输入校验失败（brief §5）→ 退出码 2，不执行任何命令
    print('test_worker: BLOCKED: %s' % msg, file=sys.stderr)
    sys.exit(2)


def validate_commands(path):
    # 命令清单校验：任何失败 → BLOCKED，不执行任何命令（brief §4：空清单直接拒绝）
    try:
        with open(path, 'rb') as f:
            spec = json.loads(f.read().decode('utf-8'))
    except Exception as exc:
        fail_blocked('commands file unreadable or invalid JSON: %r' % (exc,))
    if not isinstance(spec, dict):
        fail_blocked('commands spec must be a JSON object')
    if spec.get('schema_version') != '1.0':
        fail_blocked('schema_version must be "1.0"')
    cmds = spec.get('commands')
    if not isinstance(cmds, list) or len(cmds) == 0:
        fail_blocked('commands must be a non-empty array (empty list rejected per brief §4)')
    seen = set()
    for c in cmds:
        if not isinstance(c, dict):
            fail_blocked('each command must be a JSON object')
        cid = c.get('id')
        if not isinstance(cid, str) or not CMD_ID_RE.match(cid) or cid in seen:
            fail_blocked('command id missing/duplicate/malformed: %r' % (cid,))
        seen.add(cid)
        if not isinstance(c.get('name'), str) or not c['name']:
            fail_blocked('%s: name required' % cid)
        argv = c.get('argv')
        if (not isinstance(argv, list) or len(argv) == 0
                or not all(isinstance(x, str) and x for x in argv)):
            fail_blocked('%s: argv must be a non-empty array of non-empty strings' % cid)
        exe = os.path.basename(argv[0]).lower()
        if exe not in EXEC_ALLOWLIST:
            fail_blocked('%s: executable %r not in allowlist %s'
                         % (cid, argv[0], sorted(EXEC_ALLOWLIST)))
        t = c.get('timeout_seconds')
        if not isinstance(t, int) or isinstance(t, bool) or t <= 0 or t > MAX_TIMEOUT_SECONDS:
            fail_blocked('%s: timeout_seconds must be an integer in 1..%d' % (cid, MAX_TIMEOUT_SECONDS))
    return cmds


def main():
    ap = argparse.ArgumentParser(
        prog='test_worker',
        description='F-003 minimal test execution worker (T-P1-907). '
                    'Executes a JSON command list with argv subprocess against a verified worktree/commit.')
    ap.add_argument('--worktree', required=True, help='absolute path of the Git worktree under test')
    ap.add_argument('--commit-sha', required=True, help='full 40-hex lowercase SHA the worktree HEAD must match')
    ap.add_argument('--commands', required=True, help='path of the JSON command list (schema_version 1.0)')
    ap.add_argument('--task-id', required=True)
    ap.add_argument('--execution-id', required=True, help='unique id, EXEC-<digits>')
    ap.add_argument('--output-dir', required=True, help='evidence output directory for this execution')
    args = ap.parse_args()

    if not EXEC_ID_RE.match(args.execution_id):
        fail_blocked('execution_id must match EXEC-<digits>')
    if not SHA_RE.match(args.commit_sha):
        fail_blocked('commit_sha must be a full 40-hex lowercase SHA (short SHA rejected)')
    if not os.path.isdir(args.worktree):
        fail_blocked('worktree does not exist: %s' % args.worktree)
    try:
        r1 = subprocess.run(['git', '-C', args.worktree, 'rev-parse', '--show-toplevel'],
                            capture_output=True, check=True)
        toplevel = os.path.normpath(os.path.abspath(r1.stdout.decode('utf-8', 'replace').strip()))
        if toplevel != os.path.normpath(os.path.abspath(args.worktree)):
            fail_blocked('--worktree is not a git worktree root (toplevel=%s)' % toplevel)
        r2 = subprocess.run(['git', '-C', args.worktree, 'rev-parse', 'HEAD'],
                            capture_output=True, check=True)
        head = r2.stdout.decode('utf-8', 'replace').strip().lower()
    except (subprocess.CalledProcessError, OSError) as exc:
        fail_blocked('git query failed: %r' % (exc,))
    if head != args.commit_sha:
        fail_blocked('worktree HEAD %s != specified commit_sha %s (no auto checkout/reset; worker only verifies)'
                     % (head, args.commit_sha))

    cmds = validate_commands(args.commands)

    os.makedirs(args.output_dir, exist_ok=True)
    metas = []
    for c in cmds:
        cid = c['id']
        out_p = os.path.join(args.output_dir, cid + '.stdout')
        err_p = os.path.join(args.output_dir, cid + '.stderr')
        meta_p = os.path.join(args.output_dir, cid + '.meta.json')
        started = now_iso()
        t0 = time.monotonic()
        status, timed_out, exception, exit_code = 'COMPLETED', False, None, None
        try:
            with open(out_p, 'wb') as fo, open(err_p, 'wb') as fe:
                p = subprocess.Popen(c['argv'], cwd=args.worktree, shell=False,
                                     stdout=fo, stderr=fe, stdin=subprocess.DEVNULL)
                try:
                    p.wait(timeout=c['timeout_seconds'])
                    exit_code = p.returncode
                except subprocess.TimeoutExpired:
                    timed_out = True
                    status = 'TIMEOUT'
                    p.kill()
                    p.wait()
        except OSError as exc:
            # 启动异常也必须留下 stdout/stderr 文件及异常 meta，不丢失该命令的执行记录（规划 §2.4）
            exception = repr(exc)
            status = 'START_ERROR'
            open(out_p, 'ab').close()
            open(err_p, 'ab').close()
        meta = {
            'command_id': cid, 'name': c['name'], 'argv': c['argv'],
            'started_at': started, 'finished_at': now_iso(),
            'duration_ms': int((time.monotonic() - t0) * 1000),
            'exit_code': exit_code, 'status': status,
            'timed_out': timed_out, 'exception': exception,
            'stdout_path': cid + '.stdout', 'stdout_sha256': sha256_file(out_p),
            'stderr_path': cid + '.stderr', 'stderr_sha256': sha256_file(err_p),
        }
        with open(meta_p, 'w', encoding='utf-8', newline='') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
            f.write('\n')
        metas.append(meta)

    # 状态计算（brief §5 五行穷举，无人工覆盖入口）：非零退出/超时/启动异常任一存在 → EXECUTED_FAIL/REWORK
    any_bad = any(m['exit_code'] != 0 or m['status'] != 'COMPLETED' for m in metas)
    execution_result = 'EXECUTED_FAIL' if any_bad else 'EXECUTED_PASS'
    result = 'REWORK' if any_bad else 'PASS'
    report = {
        'task_id': args.task_id,
        'execution_id': args.execution_id,
        'commit_sha': head,
        'execution_result': execution_result,
        'result': result,
        'artifact_id': None,  # 方案 B：本阶段不做 M1 REST 登记（brief §9）
        'payload': {
            'worker_version': WORKER_VERSION,
            'worktree': os.path.abspath(args.worktree),
            'head_verified': True,
            'commands': [
                {'command_id': m['command_id'], 'name': m['name'], 'argv': m['argv'],
                 'exit_code': m['exit_code'], 'status': m['status'],
                 'timed_out': m['timed_out'], 'exception': m['exception'],
                 'duration_ms': m['duration_ms']}
                for m in metas],
            'evidence_index': [
                {'command_id': m['command_id'],
                 'stdout_path': m['stdout_path'], 'stdout_sha256': m['stdout_sha256'],
                 'stderr_path': m['stderr_path'], 'stderr_sha256': m['stderr_sha256'],
                 'meta_path': m['command_id'] + '.meta.json'}
                for m in metas],
        },
    }
    report_path = os.path.join(args.output_dir, 'test-report.json')
    with open(report_path, 'w', encoding='utf-8', newline='') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('test_worker: %s %s %s (%d commands) report=%s'
          % (args.execution_id, execution_result, result, len(metas), report_path))
    sys.exit(1 if any_bad else 0)


if __name__ == '__main__':
    main()
