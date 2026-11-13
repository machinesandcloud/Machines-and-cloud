#!/usr/bin/env python3 -I
# mutants.py <worktree> <scratch> <playwright index.mjs>: each mutant on its own throwaway copy; the named check must FAIL.
import sys, os, shutil, subprocess, json
W, S, PW = sys.argv[1], sys.argv[2], sys.argv[3]
NM = S.rsplit('/fc2s', 1)[0] + '/p10/nm'
NODE = shutil.which('node'); SB = W + '/qa-artifacts/claude-collaboration/release4-candidate/harness/deny-net.sb'
M = [  # id, file, old, new, check ('node' | 'ui')
 ('M01-embed-always-english', 'embed.js', "function L(){return !setupCheck&&!setupInvalid&&visitorSpanish()?'es':'en';}", "function L(){return 'en';}", 'ui'),
 ('M02-embed-server-refusal-not-mapped', 'embed.js', "if(L()==='es')error.message=spanishServerMessage(error);", "", 'ui'),
 ('M03-embed-ignores-conversation', 'embed.js', "state.transcript.some(function(m){return m&&m.role==='user'&&looksSpanish(m.content);})", "false", 'ui'),
 ('M04-embed-ignores-shop-setting', 'embed.js', "shopSpanish=d.spanish===true;", "shopSpanish=true;", 'ui'),
 ('M05-embed-missing-es-key', 'embed.js', "noLoad:'El chat no carg\\u00f3. Revise su conexi\\u00f3n e intente de nuevo.',", "", 'node'),
 ('M06-followup-ignores-language', 'netlify/functions/lib/request-followup.mjs', "'request_followup',lead)(c,lead", "'request_followup',{})(c,lead", 'node'),
 ('M07-followup-es-not-gsm7', 'netlify/functions/lib/desk.mjs', "le escribimos una sola vez sobre su solicitud", "le escribimos sólo una vez sobre su solicitud", 'node'),
 ('M08-followup-english-changed', 'netlify/functions/lib/desk.mjs', "checking once about your service request (ref ${l.id}). Reply here", "checking once about your request (ref ${l.id}). Reply here", 'node'),
 ('M09-quote-preview-url-es', 'desk-requests.js', "body.replace(' Si necesita ayuda, responda a este mensaje.',' Su presupuesto: '+url+' Si necesita ayuda, responda a este mensaje.')", "body", 'ui'),
 ('M10-visit-no-language-badge', 'desk.js', "return row&&row.language==='es'?' '+", "return false&&row.language==='es'?' '+", 'ui'),
 ('M11-calendar-no-language', 'desk-calendar.js', "(row.language==='es'?(compact?", "(false?(compact?", 'ui'),
 ('M12-request-source-no-language', 'netlify/functions/lib/request-followthrough.mjs', "'contact','createdAt','language']", "'contact','createdAt']", 'ui'),
 ('M13-customers-no-language', 'desk-customers.js', "if (r.language === 'es') c.spanish = true;", "", 'ui'),
 ('M14-csv-no-language', 'netlify/functions/client.mjs', "b.language === 'es' ? 'es' : b.language ? 'en' : ''", "''", 'node'),
 ('M15-block-range-first-day-only', 'netlify/functions/lib/store.mjs', "while (days.at(-1) < end) {", "while (false) {", 'node'),
 ('M16-block-label-dropped', 'netlify/functions/lib/store.mjs', "...(b.label ? { label: b.label } : {}), existingBookings", "existingBookings", 'node'),
 ('M17-block-range-with-window-allowed', 'netlify/functions/lib/store.mjs', "if (!wholeDay) throw new AvailabilityInputError(\"invalid_range\", \"A date range", "if (false) throw new AvailabilityInputError(\"invalid_range\", \"A date range", 'node'),
 ('M18-block-no-31-day-cap', 'netlify/functions/lib/store.mjs', "if (days.length > BLOCK_RANGE_DAYS)", "if (days.length > 400)", 'node'),
 ('M19-block-label-unvalidated', 'netlify/functions/lib/store.mjs', "if (typeof name !== \"string\" || name.length > BLOCK_LABEL_MAX || /[\\u0000-\\u001f\\u007f-\\u009f<>]/.test(name) || (!blocked && name))", "if (false)", 'node'),
 ('M20-client-drops-range', 'netlify/functions/client.mjs', "{ through: b.through ?? \"\", label: b.label ?? \"\" }", "{}", 'node'),
 ('M21-calendar-block-label-hidden', 'desk-calendar.js', "'<small>'+esc(row.label||'Blocked time')+'</small>", "'<small>Blocked time</small>", 'ui'),
 ('M22-hours-hint-static', 'desk.js', "hint.textContent = mentions ?", "hint.textContent = false ?", 'ui'),
 ('M23-onboard-examples-noop', 'onboard.js', "Object.keys(set).forEach(function (field) { var node = form.elements[field]; if (node) node.placeholder = set[field]; });", "", 'ui'),
 ('M24-onboard-greeting-hvac', 'onboard.js', "'e.g. Hi, this is the ' + (name ? name + ' ' : '') + 'front desk.", "'e.g. Hi, this is the Bayou Air front desk.", 'ui'),
 ('M26-hours-hint-weekly-closure-flagged', 'desk.js', "|\\bcerrado (?:el|del) \\d/i", "|\\bcerrado|closed (?:on|for|the)/i", 'ui'),
 ('M27-onboard-examples-long-style', 'onboard.js', "services: 'e.g. Drain cleaning'", "services: 'Drain cleaning\\nWater heater repair'", 'ui'),
 ('M25-desk-range-not-sent', 'desk.js', "through ? { through: through } : {}", "{}", 'ui'),
]
results = []
ONLY = os.environ.get('ONLY')
for mid, f, old, new, kind in M:
    if ONLY and mid not in ONLY.split(','): continue
    D = f'{S}/mut/{mid}'; shutil.rmtree(D, ignore_errors=True)
    subprocess.run(['rsync', '-a', '--exclude', '.git', '--exclude', 'node_modules', '--exclude', 'qa-artifacts', '--exclude', 'scratchpad', W + '/', D + '/'], check=True)
    os.makedirs(D + '/qa-artifacts/claude-collaboration', exist_ok=True); shutil.copytree(W + '/qa-artifacts/claude-collaboration/fc2-spanish', D + '/qa-artifacts/claude-collaboration/fc2-spanish')
    os.symlink(NM, D + '/node_modules')
    p = D + '/' + f; s = open(p, encoding='utf-8').read(); n = s.count(old)
    if n != 1: results.append({'id': mid, 'error': f'anchor count {n}'}); print(mid, 'ANCHOR', n); continue
    open(p, 'w', encoding='utf-8').write(s.replace(old, new))
    env = {'PATH': os.path.dirname(NODE) + ':/usr/bin:/bin', 'HOME': os.environ['HOME'], 'TMPDIR': os.environ.get('TMPDIR', '/tmp'), 'MC_MEMORY_STORE': '1', 'MC_FAKE_MODEL': '1', 'MC_LOCAL_NO_KEYS': '1'}
    outcome = {}
    for k in (['node', 'ui'] if kind == 'none' else [kind]):
        cmd = [NODE, 'qa-artifacts/claude-collaboration/fc2-spanish/fc2-spanish-check.mjs'] if k == 'node' else [NODE, 'qa-artifacts/claude-collaboration/fc2-spanish/fc2-spanish-ui-check.mjs', '--playwright', PW, '--out', D + '/ui']
        if k == 'node': cmd = ['sandbox-exec', '-f', SB] + cmd
        r = subprocess.run(cmd, cwd=D, env=env, capture_output=True, text=True, timeout=900)
        outcome[k] = {'rc': r.returncode, 'failed': [l[5:120] for l in r.stdout.splitlines() if l.startswith('FAIL ')], 'tail': r.stdout.strip().splitlines()[-1:] }
    killed = any(o['rc'] != 0 for o in outcome.values())
    results.append({'id': mid, 'file': f, 'killed': killed, **outcome}); print(mid, 'KILLED' if killed else 'SURVIVED', json.dumps(outcome)[:300])
    shutil.rmtree(D, ignore_errors=True)
json.dump(results, open(S + '/mutants.json', 'w'), indent=1)
print(sum(1 for r in results if r.get('killed')), '/', len(results), 'killed')
