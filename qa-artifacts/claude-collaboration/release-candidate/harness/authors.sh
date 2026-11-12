#!/bin/bash
# authors.sh <copy> <outdir>: every applied proposal's own non-browser check, offline, fresh process each.
RC=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/rc
C=$1; O=$2; mkdir -p $O; : > $O/SUMMARY.tsv
BP=/tmp/mc-claude-backend-proposals-20261110/qa-artifacts/claude-collaboration/backend-proposals
VR=/tmp/mc-claude-voice-review-20261110/qa-artifacts/claude-collaboration/voice-review/proposal-11
G12=/tmp/mc-claude-backend-gaps-proposal-20261110/qa-artifacts/claude-collaboration/backend-gaps-proposal
SC=/tmp/mc-claude-sms-safety-compare-20261110/qa-artifacts/claude-collaboration
V14=/tmp/mc-claude-voice-v5v6-20261110/qa-artifacts/claude-collaboration/voice-v5v6
A15=/tmp/mc-claude-public-abuse-review-20261111/qa-artifacts/claude-collaboration/public-abuse-review
T09=/tmp/mc-claude-chat-token-proposal-20261110/qa-artifacts/claude-collaboration/chat-token-proposal
IX=/tmp/mc-claude-proposals-index-20261110/qa-artifacts/claude-collaboration/proposals-index/stacked
CV13=/tmp/mc-claude-concurrent-visit-20261110/qa-artifacts/claude-collaboration/concurrent-visit
P16=/tmp/mc-claude-scheduled-texts-review-20261111/qa-artifacts/claude-collaboration/scheduled-texts-review/proposal-16
PCU=/tmp/mc-claude-calendar-unconnected-fix-20261111/qa-artifacts/claude-collaboration/calendar-unconnected-fix
CVC=/tmp/mc-claude-customer-visit-changes-20261111/qa-artifacts/claude-collaboration/customer-visit-changes
PV=/tmp/mc-claude-post-visit-fix-20261112/qa-artifacts/claude-collaboration/post-visit-fix
OH=/tmp/mc-claude-optout-health-fix-20261112/qa-artifacts/claude-collaboration/optout-health-fix
r(){ n=$1; shift; t0=$(date +%s); rc=$($RC/run1.sh $C $O/$n.log "$@"); printf '%s\t%s\t%ss\n' "$n" "$rc" "$(( $(date +%s)-t0 ))" >> $O/SUMMARY.tsv; }
cs(){ cp "$1" $C/scripts/$(basename "$1"); }
r 01-stop-keywords-check node $BP/stop-keywords-check.mjs --repo $C --output $O/01.json
r 02-chat-403-check node $BP/chat-403-check.mjs --repo $C --output $O/02.json
r a54-03-delta-check node $SC/sms-safety-compare/tools/a54-03-delta-check.mjs --repo $C --output $O/a54-03.json
for s in sms-safety-check sms-safety-check-r2; do r codex-$s node $SC/root-sms-safety-repair-20261110/$s.mjs --repo $C --output $O/codex-$s.json; done
r codex-r2-disposition node $SC/sms-safety-compare/tools/codex-r2-disposition.mjs --repo $C --output $O/codex-r2-disposition.json
r 04-tool-result-truth-check node $BP/tool-result-truth-check.mjs --repo $C --output $O/04.json
r 04m-tool-result-truth-check node $IX/qa/probes/04m-tool-result-truth-check.mjs --repo $C --output $O/04m.json
r 05-callback-promise-check node $BP/callback-promise-check.mjs --repo $C --output $O/05.json
r 06-csv-injection-check node $BP/csv-injection-check.mjs --repo $C --output $O/06.json
r 07-missed-call-promise-check node $BP/missed-call-promise-check.mjs --repo $C --output $O/07.json
r 07m-missed-call-promise-check node $IX/qa/probes/07m-missed-call-promise-check.mjs --repo $C --output $O/07m.json
r 09-chat-token-check node $T09/chat-token-check.mjs --output $O/09.json
r a54-10-agent-truncation-check node --import $SC/sms-safety-compare/tools/p10-model-stub.mjs $SC/sms-safety-compare/tools/agent-truncation-check.mjs --repo $C --output $O/a54-10.json
r a54-10m-agent-truncation-check node --import $SC/sms-safety-compare/tools/p10-model-stub.mjs $IX/qa/probes/10m-agent-truncation-check.mjs --repo $C --output $O/a54-10m.json
r 11-voice-truth-fault node $VR/voice-truth-check.mjs $C fault
r 11m-voice-truth-fault node $IX/qa/probes/11m-voice-truth-check.mjs $C fault
r 11-voice-truth-network node $VR/voice-truth-check.mjs $C network
for s in p12-manage-receipt-check p12-visit-refusal-check p12-sms-legacy-check p12-sms-failclosed-check p12-sms-matcher-check p12-owner-alert-check p12-after04-check; do cs $G12/$s.mjs; r 12-$s node scripts/$s.mjs; done
cs $IX/qa/probes/p12m-sms-failclosed-check.mjs; r 12-p12m-sms-failclosed node scripts/p12m-sms-failclosed-check.mjs
cp $CV13/p12-visit-refusal-check.with-13.mjs $C/scripts/p12-visit-refusal-check-with13.mjs; r 13-p12-visit-refusal-with-13 node scripts/p12-visit-refusal-check-with13.mjs
for s in p13-concurrent-visit-check p13-initial-capacity-check p13-latency-check; do cs $CV13/$s.mjs; r 13-$s node scripts/$s.mjs; done
cs $V14/voice-v6-check.mjs; r 14-voice-v6-check node scripts/voice-v6-check.mjs
EXTRA_ENV="SRC=$C" r 15-v15-fixes node $A15/proposal-15/verify/v15-fixes.mjs
EXTRA_ENV="SRC=$C" r 15-v15-extra node $A15/proposal-15/verify/v15-extra.mjs
cs $IX/probes/p15s-server-check.mjs; r 15s-p15s-server-check node scripts/p15s-server-check.mjs
r 15s-qa-stack-adversarial node $IX/qa/probes/qa-stack-adversarial.mjs --repo $C --output $O/adv.json
for s in $P16/checks12/*-16r3.mjs; do cs $s; b=$(basename $s .mjs); if [[ $b == qa12r3* ]]; then r 16-$b node scripts/$b.mjs --fixed; else r 16-$b node scripts/$b.mjs; fi; done
r 17-p17-calendar-repro-check node scripts/p17-calendar-repro-check.mjs
r 17-calendar-execution-check node scripts/calendar-execution-check.mjs
r 18-data-erasure-check node scripts/data-erasure-check.mjs
r 19-account-lifecycle-check node scripts/account-lifecycle-check.mjs
cs $PCU/pcu-calendar-unconnected-check-r2.mjs; r pcu-calendar-unconnected-check-r2 node scripts/pcu-calendar-unconnected-check-r2.mjs --output $O/pcu.json
r channel-availability-check node scripts/channel-availability-check.mjs
cp $CVC/visit-change-check-r3.mjs $C/scripts/visit-change-check.mjs; (cd $C/scripts && patch -s visit-change-check.mjs < $CVC/qa/r3/QA-VISIT-r3-tests.patch) ; r visit-change-check-r3-plus-qa node scripts/visit-change-check.mjs --output $O/visit-change.json
for s in post-visit-check post-visit-inbound-check; do cs $PV/$s.mjs; r pv-$s node scripts/$s.mjs --output $O/$s.json; done
r optout-health-check node $OH/optout-health-check.mjs --repo $C --output $O/optout.json
t0=$(date +%s); rc=$(zsh /tmp/mc-claude-urgency-spanish-fix-20261112/qa-artifacts/claude-collaboration/urgency-spanish-fix/check/run-check.sh $C $O/urgency.json > $O/urgency-spanish.log 2>&1; echo $?); printf 'urgency-spanish-check\t%s\t%ss\n' $rc $(( $(date +%s)-t0 )) >> $O/SUMMARY.tsv
