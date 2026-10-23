import json, os, pathlib, subprocess, tempfile, datetime

source = pathlib.Path('/tmp/zaricoach-mc-proof-421')
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip()
out = pathlib.Path('/tmp/mc-production-readiness-47e/scratchpad/zaricoach-build-boundary-check.json')
results = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sourceCommit': head, 'localOnly': True, 'realNpmCommands': 0, 'databaseOperations': 0, 'cases': []}
with tempfile.TemporaryDirectory(prefix='zari-build-boundary-') as temporary:
    root = pathlib.Path(temporary)
    repo = root / 'repo'
    subprocess.run(['git', 'clone', '--shared', '--quiet', '--no-checkout', str(source), str(repo)], check=True)
    subprocess.run(['git', 'checkout', '--quiet', '--detach', head], cwd=repo, check=True)
    mockbin = root / 'bin'; mockbin.mkdir()
    npm = mockbin / 'npm'
    npm.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_NPM_LOG"\n')
    npm.chmod(0o700)
    log = root / 'npm.log'
    env = {key: os.environ[key] for key in ['PATH', 'HOME', 'TMPDIR'] if key in os.environ}
    env.update(PATH=str(mockbin) + ':' + env['PATH'], MOCK_NPM_LOG=str(log))

    def run_case(name, selected=None, ref=None, expected=None):
        log.write_text('')
        local = dict(env)
        if selected is not None: local['MC_ACCEPTANCE_BUILD_COMMIT'] = selected
        if ref is not None: local['COMMIT_REF'] = ref
        response = subprocess.run(['bash', 'scripts/netlify_build.sh'], cwd=repo, env=local, text=True, capture_output=True)
        calls = log.read_text().splitlines()
        assert (response.returncode == 0) == (expected is not None), (name, response.stderr)
        assert calls == (expected or []), (name, calls)
        results['cases'].append({'name': name, 'exitCode': response.returncode, 'mockNpmCommands': calls})

    normal = ['run prisma:generate', 'run prisma:migrate', 'run prisma:seed', 'run typecheck', 'test', 'run build']
    isolated = ['run prisma:generate', 'run typecheck', 'test', 'run build']
    run_case('no flag preserves ordinary maintenance path', expected=normal)
    run_case('exact reviewed source skips all DB maintenance', head, head, isolated)
    run_case('malformed flag fails before npm', 'true', head)
    run_case('missing build commit fails before npm', head)
    run_case('stale build commit fails before npm', head, 'f'*40)
    for file in ['prisma/schema.prisma', 'prisma/migrations/20990101000000_uncommitted/migration.sql']:
        target = repo / file; target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('a') as stream: stream.write('\n// uncommitted fixture drift\n')
        run_case('working source drift: ' + file, head, head)
        subprocess.run(['git', 'reset', '--hard', '--quiet', head], cwd=repo, check=True)
        subprocess.run(['git', 'clean', '-fdq'], cwd=repo, check=True)
    for name, file in [
        ('schema drift', 'prisma/schema.prisma'),
        ('seed drift', 'prisma/seed.js'),
        ('new migration', 'prisma/migrations/20990101000000_unapproved/migration.sql'),
        ('role seed input drift', 'src/lib/roles.ts'),
        ('company seed input drift', 'src/lib/company-data.ts'),
    ]:
        subprocess.run(['git', 'reset', '--hard', '--quiet', head], cwd=repo, check=True)
        subprocess.run(['git', 'clean', '-fdq'], cwd=repo, check=True)
        target = repo / file; target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('a') as stream: stream.write('\n// unapproved fixture drift\n')
        subprocess.run(['git', 'add', file], cwd=repo, check=True)
        subprocess.run(['git', '-c', 'user.name=Boundary fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', name], cwd=repo, check=True)
        changed = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
        run_case(name + ' rejects even matching selected commit', changed, changed)
    subprocess.run(['git', 'reset', '--hard', '--quiet', head], cwd=repo, check=True)
    for context, hook, expected in [('production', '', 0), ('production', 'GitHub CI', 1), ('deploy-preview', '', 1)]:
        gate_env = dict(env, CONTEXT=context, INCOMING_HOOK_TITLE=hook)
        response = subprocess.run(['bash', 'scripts/netlify_ci_gate.sh'], cwd=repo, env=gate_env, text=True, capture_output=True)
        assert response.returncode == expected
        results['cases'].append({'name': 'unchanged CI gate: '+context+'/'+hook, 'exitCode': response.returncode})
results['pass'] = True
out.write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps({'pass': True, 'groups': len(results['cases']), 'databaseOperations': 0}))
