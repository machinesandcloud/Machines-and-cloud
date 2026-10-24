import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent.parent
os.chdir(root)
suffix = sys.argv[1] if len(sys.argv) == 2 else ''
assert re.fullmatch(r'(?:-r[0-9]+)?', suffix)
receipt = root / ('scratchpad/launch-finish-required-gate' + suffix + '.json')
if receipt.exists():
    raise SystemExit('Do not overwrite an existing gate receipt.')
command = re.search(r'^  command = "([^"]+)"', Path('netlify.toml').read_text(), re.M)[1]
commands = [shlex.split(part.strip()) for part in command.split('&&')]
assert all(len(c) == 2 and c[0] == 'node' and c[1].startswith('scripts/') for c in commands)
files = sorted(str(p) for p in Path('.').rglob('*') if p.is_file() and p.parts[0] in ('netlify', 'scripts'))
files += ['netlify.toml', 'desk.html', 'desk.css', 'desk.js', 'desk-activity.js', 'desk-visits.js', 'desk-conversations.js', 'desk-connections.js', 'embed.js', 'privacy-policy.html', 'desk-lead-sources.js', 'desk-lead-sources.css', 'desk-requests.js', 'onboard.js', 'onboard.html', 'onboard.css', 'admin.js', 'admin.html', 'admin.css', 'package.json', 'package-lock.json']
hashes = lambda: {p: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in files}
report = {'at': datetime.now(timezone.utc).isoformat(), 'baseCommit': subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(), 'scope': 'Exact current Netlify required command list, each in a fresh process; provider environment removed, physical Node transport blocked; synthetic protocol doubles remain synthetic.', 'sourceBefore': hashes(), 'checks': [], 'externalEffectsAuthorized': False}
receipt.write_text(json.dumps(report, indent=2) + '\n')
env = {k:v for k,v in os.environ.items() if not re.match(r'^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|MC_PLATFORM_|VAPI_|THUMBTACK_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|WORKSPACE_BILLING_|ADMIN_KEY|URL$|PUBLIC_SITE_URL$)', k)}
env.update({'MC_MEMORY_STORE':'1','MC_FAKE_MODEL':'1','MC_LOCAL_NO_KEYS':'1','NODE_OPTIONS':'--import=' + str(root/'scratchpad/full-offer-offline-guard.mjs')})
for number, cmd in enumerate(commands, 1):
    log = root / (('scratchpad/launch-finish-gate' + suffix + '-%02d.log') % number)
    with log.open('x') as output:
        result = subprocess.run(cmd, env=env, stdout=output, stderr=subprocess.STDOUT)
    report['checks'].append({'command':shlex.join(cmd), 'exitCode':result.returncode, 'log':str(log.relative_to(root))})
    receipt.write_text(json.dumps(report, indent=2) + '\n')
    print('%d/%d %s %s' % (number, len(commands), 'PASS' if result.returncode == 0 else 'FAIL', cmd[1]), flush=True)
    if result.returncode != 0:
        break
report['sourceAfter'] = hashes()
report['sourceStable'] = report['sourceBefore'] == report['sourceAfter']
report['ok'] = len(report['checks']) == len(commands) and all(c['exitCode'] == 0 for c in report['checks']) and report['sourceStable']
report['finishedAt'] = datetime.now(timezone.utc).isoformat()
receipt.write_text(json.dumps(report, indent=2) + '\n')
raise SystemExit(0 if report['ok'] else 1)
