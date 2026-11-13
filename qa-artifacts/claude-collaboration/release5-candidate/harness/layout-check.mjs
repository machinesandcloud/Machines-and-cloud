// layout-check.mjs <metrics.json>: acceptance for PRA-POLISH-01..08 from the measured layout (shots.mjs). Exit 1 on any failure.
import { readFileSync } from 'node:fs';
const M = JSON.parse(readFileSync(process.argv[2], 'utf8')); let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) pass++; else fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + JSON.stringify(detail) : '')); };
const inView = r => r && r.top >= 0 && r.bottom <= r.vh;
const m = M['390'], d = M['1440'], TAB = 74; // fixed bottom tab bar height on phones
ok('390 home: first request (name + urgency badge) is above the fold and the tab bar', m.homeFirstRequest && m.homeFirstRequest.top + 60 <= m.homeFirstRequest.vh - TAB, m.homeFirstRequest);
ok('390 home: Recent activity repeats no bordered View request buttons', m.homeActivityButtons === 0, m.homeActivityButtons);
ok('390 inbox: job description comes before the action buttons', m.inboxRow.jobTop < m.inboxRow.firstButtonTop, m.inboxRow);
ok('390 inbox: View request and Acknowledge share one row, 44px tall', m.inboxRow.buttonsSameRow && m.inboxRow.buttonH.every(h => h >= 44), m.inboxRow);
ok('390 inbox: date/time does not wrap', m.inboxRow.timeLines === 1, m.inboxRow.timeLines);
ok('1440 inbox: actions side by side', d.inboxRow.buttonsSameRow === true, d.inboxRow);
for (const [w, x] of [['390', m], ['1440', d]]) {
  ok(w + ' request dialog: close stays visible after scrolling to the end', inView(x.reqBottom.close) && x.reqBottom.close.w === 44, x.reqBottom.close);
  ok(w + ' request dialog: Save action visible while choosing an action', inView(x.reqForm.save) && inView(x.reqForm.action), x.reqForm);
  ok(w + ' Add visit: Save visible on open', inView(x.addVisit.save), x.addVisit.save);
  ok(w + ' Add visit: Save and close visible after empty submit', inView(x.addVisitErr.save) && inView(x.addVisitErr.close), x.addVisitErr);
  ok(w + ' visit dialog: Save new time visible on open', inView(x.visit.save), x.visit.save);
  ok(w + ' one close style: 44x44 icon button in request and visit dialogs', x.reqTop.close.w === 44 && x.reqTop.close.h === 44 && x.addVisit.close.w === 44 && x.addVisit.close.h === 44);
  for (const g of ['ob1Gaps', 'ob2Gaps', 'ob3Gaps']) ok(w + ' onboarding ' + g + ': no label closer than 16px to the previous error or hint', x[g] && x[g].minGap >= 16, x[g]);
  ok(w + ' Add visit errors: no label closer than 16px to the previous error', x.addVisitErr.gaps.minGap >= 16, x.addVisitErr.gaps);
  ok(w + ' Schedule: Today/next keep their size and place between Month and Week', JSON.stringify(x.schedToday) === JSON.stringify(x.schedTodayWeek) && JSON.stringify(x.schedNext) === JSON.stringify(x.schedNextWeek));
}
for (const s of ['ob1', 'ob2', 'ob4']) {
  ok('390 onboarding ' + s + ': first field starts in the top 45% of the screen', m[s + 'First'].top <= m[s + 'First'].vh * 0.45, m[s + 'First']);
  ok('390 onboarding ' + s + ': Save and continue visible without scrolling', inView(m[s + 'Next']), m[s + 'Next']);
}
ok('390 onboarding: an empty field in error shows no example text', /rgba\(0, 0, 0, 0\)|transparent/.test(m.ob3WindowsPlaceholder), m.ob3WindowsPlaceholder);
ok('390 Schedule: opens in Agenda with the first visit on the first screen', m.schedMode === 'agenda' && m.schedFirstVisit && m.schedFirstVisit.bottom <= m.schedFirstVisit.vh - TAB, { mode: m.schedMode, v: m.schedFirstVisit });
ok('1440 Schedule: desktop default stays Month', d.schedMode === 'month');
// rev 2 (QA R1-R6): focused fields stay clear of the sticky header/footer; 320 rows, Schedule title, rail.
const none = x => x && x.bad && x.bad.length === 0 && x.fields > 0;
for (const [w, x] of [['320', M['320']], ['390', m], ['1440', d]]) {
  ok(w + ' request dialog: focused Note is not under the sticky footer or header', x.reqNote && x.reqNote.covered === 0, x.reqNote);
  ok(w + ' request dialog: Note focused while under the sticky footer scrolls fully into view', x.reqNoteUnder && x.reqNoteUnder.after.covered === 0, x.reqNoteUnder);
  ok(w + ' request dialog: every field reached by Tab is fully visible', none(x.reqWalk), x.reqWalk);
  ok(w + ' Schedule: range title is not clipped (first view, Month, Week)', [x.schedTitleFirst, x.schedTitleMonth, x.schedTitleWeek].every(t => t && !t.clipped), [x.schedTitleFirst, x.schedTitleMonth, x.schedTitleWeek]);
}
for (const [w, x] of [['320', M['320']], ['390', m]]) {
  ok(w + ' inbox: time/status on its own line, then both actions on one row', x.inboxRow.buttonsSameRow === true && x.inboxRow.statusBottom <= x.inboxRow.firstButtonTop, x.inboxRow);
  for (const h of ['844', '430']) {
    ok(w + 'x' + h + ' Add visit: every field reached by Tab is fully visible', none(x.addVisitKeys && x.addVisitKeys[h]), x.addVisitKeys && x.addVisitKeys[h]);
    for (const k of ['ob2Keys', 'ob3Keys', 'ob4Keys']) ok(w + 'x' + h + ' onboarding ' + k.slice(0, 3) + ': every field reached by Tab is clear of the Back / Save bar', none(x[k] && x[k][h]), x[k] && x[k][h]);
  }
  ok(w + 'x430 Add visit: What do they need? focused while under the sticky footer scrolls fully into view', x.addVisitIssueUnder && x.addVisitIssueUnder.after.covered === 0, x.addVisitIssueUnder);
  ok(w + ' rail: Account and Quick tour stay on one line', x.rail && x.rail.guideH <= 44 && x.rail.accountH <= 44, x.rail);
}
ok('390 rail: business name and status badge share a row', m.rail && m.rail.titleBadgeSameRow === true, m.rail);
ok('no physical network, no page errors', M.physicalNetwork === 0 && !M.log.length, { net: M.physicalNetwork, log: M.log });
console.log(`RESULT ${fail ? 'FAIL' : 'PASS'} visual-polish layout: ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
