// Bounded replacement for one obsolete fixture assumption, not a runtime change.
// The original fixture expires the page, replaces private variables and calls a private send function.
// The real signed-in page must reload to acquire another identity after expiry. Keep all original
// positive save/review assertions, but initialize the complete actual assets for that fresh page.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url), sha=s=>createHash('sha256').update(s).digest('hex');
const lifecycleURL=new URL('scripts/connection-intake-lifecycle-check.mjs',root);
const original=execFileSync('git',['show','3372749d3007dd728cf9b06a83f2c175a903a4ee:scripts/connection-intake-lifecycle-check.mjs'],{cwd:root}).toString();
const from="if(continueReplacement){const fresh=state();";
const to="if(continueReplacement){listeners.clear();vm.runInContext(instrumentation(guide,guideHook),context,{filename:'fresh-page-actual-guide.js'});vm.runInContext(instrumentation(source,intakeHook),context,{filename:'fresh-page-actual-intake.js'});const freshView=view('REPLACEMENT_READY');context.__guideProbe.bind(freshView,'calendar');context.__intakeProbe.bind(freshView,state());const fresh=state();";
assert.equal(original.split(from).length,2,'Exactly one fixture boundary to replace');
assert.equal(original.split("'replacement session can perform its own later explicit save'").length,2);
const revised=original.replace(from,to)
  .replace("'replacement session can perform its own later explicit save'","'replacement session can perform its own later explicit save after fresh-page initialization'")
  .replaceAll("new URL('../desk-service-intake.js',import.meta.url)",JSON.stringify(new URL('desk-service-intake.js',root).href))
  .replaceAll("new URL('../desk-setup-guide.js',import.meta.url)",JSON.stringify(new URL('desk-setup-guide.js',root).href));
// fs accepts URL objects, not file: strings.
const source=revised
  .replace(JSON.stringify(new URL('desk-service-intake.js',root).href),'new URL('+JSON.stringify(new URL('desk-service-intake.js',root).href)+')')
  .replace(JSON.stringify(new URL('desk-setup-guide.js',root).href),'new URL('+JSON.stringify(new URL('desk-setup-guide.js',root).href)+')');
export const disposition={originalPath:lifecycleURL.pathname,originalSha256:sha(original),revisedLoadedSha256:sha(source),change:'One replacement-session fixture now initializes full actual guide/intake scripts afresh after expiry; original positive assertions unchanged.'};
const mod=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
export const checkConnectionIntakeLifecycle=mod.checkConnectionIntakeLifecycle;
if(process.argv[1]===new URL(import.meta.url).pathname){
 const result={disposition,...await checkConnectionIntakeLifecycle()};
 if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({passed:result.passed,total:result.total,disposition}));
}
