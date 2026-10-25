// Executes the literal JavaScript embedded in the production proof-only Swift driver.
// No Chrome/native API, network, window, or subprocess is used.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
export async function swiftDOMFixture(){
 const source=await readFile(new URL('./calendar-borrowed-native.swift',import.meta.url),'utf8');
 const prefix=source.match(/let prefix="\(\(\)=>\{const p="\+paramJSON\+";"\+#"""\n([\s\S]*?)\n """#/);if(!prefix)throw Error('Exact Swift JS prefix missing');
 const bodies=Object.fromEntries([...source.matchAll(/if mode=="([a-z_]+)"\{[\s\S]*?emit\(execute\("([^"\n]*)"\)\);exit\(0\)\)/g)].map(x=>[x[1],x[2]]));
 // The Swift closing brace follows exit(0), rather than a second parenthesis.
 for(const mode of ['inspect_storage','seed_navigate','observe','prepare_restore','clear_restore','verify_restore']){
  const start=source.indexOf(`if mode=="${mode}"`),end=source.indexOf('\n}',start),chunk=source.slice(start,end===-1?source.length:end+2);const m=chunk.match(/emit\(execute\("([^"\n]*)"\)\)/);if(!m)throw Error('Swift mode body missing '+mode);bodies[mode]=m[1];
 }
 return {source,modes:Object.keys(bodies),run(mode,{url,storage=new Map(),params,hashDenied=true,refuseRemovals=false}={}){
  const target=new URL(url),navigations=[],reads=[],writes=[];
  const location={origin:target.origin,pathname:target.pathname,search:target.search,assign:u=>{navigations.push(u);}};
  Object.defineProperty(location,'hash',{get(){if(hashDenied&&target.origin!=='https://mail.google.com')throw Error('OAuth fragment read denied');return target.hash;}});
  const sessionStorage={getItem:k=>{reads.push(k);return storage.has(k)?storage.get(k):null;},setItem:(k,v)=>{writes.push(['set',k]);storage.set(k,v);},removeItem:k=>{writes.push(['remove',k]);if(!refuseRemovals)storage.delete(k);}};
  if(!bodies[mode])throw Error('Unsupported exact mode');const value=JSON.parse(vm.runInNewContext('(()=>{const p='+JSON.stringify(params)+';'+prefix[1]+bodies[mode]+'})()',{URL,URLSearchParams,location,sessionStorage}));return {value,navigations,reads,writes,storage};
 }};
}
