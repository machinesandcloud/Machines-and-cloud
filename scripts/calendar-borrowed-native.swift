// Proof-only fixed regular-Chrome tab. No browser query occurs during compilation.
import Foundation
import AppKit
import ScriptingBridge
import CryptoKit
import Darwin
func fail(_ code:String)->Never{print("{\"ok\":false,\"reason\":\"\(code)\"}");exit(2)}
func emit(_ v:[String:Any]){guard let d=try?JSONSerialization.data(withJSONObject:v,options:[.sortedKeys]),let s=String(data:d,encoding:.utf8)else{fail("encoding")};print(s)}
func date(_ s:String)->Date?{let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds];return f.date(from:s)}
func hex(_ s:String,_ count:Int)->Bool{s.count==count&&s.allSatisfy({$0.isHexDigit&&(!$0.isLetter||$0.isLowercase)})}
let raw=FileHandle.standardInput.readDataToEndOfFile()
guard raw.count<=32768,let input=try?JSONSerialization.jsonObject(with:raw)as?[String:Any],let mode=input["mode"]as?String,["borrow","inspect_storage","seed_navigate","observe","prepare_restore","clear_restore","verify_restore"].contains(mode),input["chromePID"]as?Int==691,input["windowId"]as?Int==1802417929,input["tabId"]as?Int==1802419976,input["originalURL"]as?String=="https://mail.google.com/mail/u/0/#inbox",let phase=input["phaseId"]as?String,phase.hasPrefix("core-calendar-"),let slug=input["slug"]as?String,slug.range(of:"^[a-z0-9][a-z0-9-]{0,39}$",options:.regularExpression) != nil,let token=input["token"]as?String,hex(token,64),let state=input["state"]as?String,hex(state,64),let expiryText=input["expiresAt"]as?String,let expiry=date(expiryText),let authorization=input["authorizationUrl"]as?String,let auth=URLComponents(string:authorization),auth.scheme=="https",auth.host=="accounts.google.com",auth.port==nil,auth.user==nil,auth.password==nil,auth.path=="/o/oauth2/v2/auth",auth.queryItems?.first(where:{$0.name=="state"})?.value==state,auth.queryItems?.first(where:{$0.name=="redirect_uri"})?.value=="https://machinesandcloud.com/api/google/callback"else{fail("input_binding")}
let cleanup=["prepare_restore","clear_restore","verify_restore"].contains(mode)
guard cleanup||Date()<expiry else{fail("expired")}
let original="https://mail.google.com/mail/u/0/#inbox",bootstrap="https://machinesandcloud.com/privacy-policy"
let pending:[String:Any]=["slug":slug,"state":state,"expiresAt":expiryText,"sessionBinding":SHA256.hash(data:Data(token.utf8)).map{String(format:"%02x",$0)}.joined()]
guard let pendingData=try?JSONSerialization.data(withJSONObject:pending,options:[.sortedKeys]),let pendingJSON=String(data:pendingData,encoding:.utf8)else{fail("pending_encoding")}
let params:[String:Any]=["slug":slug,"token":token,"state":state,"pendingJSON":pendingJSON,"authorizationURL":authorization,"seedMayExist":input["seedMayExist"]as?Bool ?? false,"original":original,"bootstrap":bootstrap]
guard let paramData=try?JSONSerialization.data(withJSONObject:params,options:[.sortedKeys]),let paramJSON=String(data:paramData,encoding:.utf8)else{fail("parameter_encoding")}
// Fixed PID does not launch/activate Chrome. Only existing numeric IDs are read.
guard let running=NSRunningApplication(processIdentifier:691),running.bundleIdentifier=="com.google.Chrome",let app=SBApplication(processIdentifier:691),app.isRunning,let windows=app.value(forKey:"windows")as?SBElementArray else{fail("fixed_process_missing")}
var selected:[SBObject]=[]
for case let w as SBObject in windows{if let id=w.value(forKey:"id"),String(describing:id)=="1802417929"{selected.append(w)}}
guard selected.count==1,let tabs=selected[0].value(forKey:"tabs")as?SBElementArray else{fail("fixed_window_missing")}
var exact:[SBObject]=[]
for case let t as SBObject in tabs{if let id=t.value(forKey:"id"),String(describing:id)=="1802419976"{exact.append(t)}}
guard exact.count==1 else{fail("fixed_tab_missing")};let tab=exact[0]
func execute(_ body:String)->[String:Any]{
 let prefix="(()=>{const p="+paramJSON+";"+#"""
 const ownerKey='mc-onboarding-session-v1',pendingKey='mc-calendar-pending-v1';
 function ownedAuth(u,depth=0){if(depth>2)return false;try{const v=new URL(u);if(v.origin!=='https://accounts.google.com')return false;if(v.pathname==='/o/oauth2/v2/auth'&&v.searchParams.get('state')===p.state&&v.searchParams.get('redirect_uri')==='https://machinesandcloud.com/api/google/callback')return true;const c=v.searchParams.get('continue');return !!c&&ownedAuth(c,depth+1);}catch{return false;}}
 function kind(){const o=location.origin,q=new URLSearchParams(location.search);if(o==='https://mail.google.com'&&location.pathname==='/mail/u/0/'&&!location.search&&location.hash==='#inbox')return'inbox';if(o==='https://machinesandcloud.com'&&(location.pathname==='/privacy-policy'||location.pathname==='/privacy-policy.html')&&!location.search)return'privacy';if(o==='https://machinesandcloud.com'&&['/desk','/desk.html'].includes(location.pathname)&&q.get('c')===p.slug)return'desk';if(o==='https://accounts.google.com'&&(q.get('state')===p.state||ownedAuth(q.get('continue')||'')))return'google_owned';return'changed';}
 const done=x=>JSON.stringify(x);
 """#
 let script=prefix+body+"})()"
 guard let result=tab.perform(NSSelectorFromString("executeJavascript:"),with:script)?.takeUnretainedValue()as?String,result.utf8.count<=16384,let data=result.data(using:.utf8),let v=try?JSONSerialization.jsonObject(with:data)as?[String:Any]else{fail("native_result_unconfirmed")};return v
}
if mode=="borrow"{
 func fixedTabIsActive()->Bool{guard let active=selected[0].value(forKey:"activeTab")as?SBObject,let id=active.value(forKey:"id")else{return false};return String(describing:id)=="1802419976"}
 guard fixedTabIsActive(),tab.value(forKey:"URL")as?String==original else{fail("original_inbox_or_active_tab_changed")}
 guard Date()<expiry else{fail("expired_before_foreground")}
 // Only raise the explicitly bound window; never select or inspect another tab.
 selected[0].setValue(1,forKey:"index")
 guard running.activate(options:[]) else{fail("fixed_process_activation_failed")}
 let foregroundDeadline=min(Date().addingTimeInterval(2),expiry)
 while Date()<foregroundDeadline&&NSWorkspace.shared.frontmostApplication?.processIdentifier != 691{Thread.sleep(forTimeInterval:0.05)}
 guard NSWorkspace.shared.frontmostApplication?.processIdentifier==691,selected[0].value(forKey:"index")as?Int==1,fixedTabIsActive() else{fail("fixed_foreground_unconfirmed")}
 guard Date()<expiry,tab.value(forKey:"URL")as?String==original else{fail("original_inbox_changed_before_navigation")}
 tab.setValue(bootstrap,forKey:"URL");emit(["ok":true,"foregroundConfirmed":true,"navigationDispatched":true]);exit(0)
}
if mode=="inspect_storage"{emit(execute("const k=kind();if(k!=='privacy')return done({ok:false,pending:k==='inbox',changed:k==='changed'});return done({ok:true,ownerKeyAbsent:sessionStorage.getItem(ownerKey)===null,pendingKeyAbsent:sessionStorage.getItem(pendingKey)===null});"));exit(0)}
if mode=="seed_navigate"{
 guard Date()<expiry else{fail("expired_before_seed")}
 emit(execute("if(kind()!=='privacy')return done({ok:false,changed:true});if(sessionStorage.getItem(ownerKey)!==null||sessionStorage.getItem(pendingKey)!==null)return done({ok:false,reason:'existing_owner_storage'});sessionStorage.setItem(ownerKey,p.token);sessionStorage.setItem(pendingKey,p.pendingJSON);location.assign(p.authorizationURL);return done({ok:true,seeded:true,navigationDispatched:true});"));exit(0)
}
if mode=="observe"{emit(execute("const k=kind();return done({ok:k!=='changed',pageKind:k,atControlledReturn:k==='desk'});"));exit(0)}
if mode=="prepare_restore"{emit(execute("const k=kind();if(k==='inbox')return done({ok:true,atOriginalInbox:true});if(k==='privacy')return done({ok:true,atPrivacy:true});if(!['desk','google_owned'].includes(k))return done({ok:false,changed:true});location.assign(p.bootstrap);return done({ok:true,navigationDispatched:true});"));exit(0)}
if mode=="clear_restore"{
 emit(execute("const k=kind();if(k!=='privacy')return done({ok:false,pending:['desk','google_owned'].includes(k),changed:k==='changed'});let restored=true,outcome='untouched';if(p.seedMayExist){const a=sessionStorage.getItem(ownerKey),b=sessionStorage.getItem(pendingKey);if((a!==null&&a!==p.token)||(b!==null&&b!==p.pendingJSON)){restored=false;outcome='conflict';}else{outcome=a===null&&b===null?'already_absent':'cleared_owned';if(a===p.token)sessionStorage.removeItem(ownerKey);if(b===p.pendingJSON)sessionStorage.removeItem(pendingKey);if(sessionStorage.getItem(ownerKey)!==null||sessionStorage.getItem(pendingKey)!==null){restored=false;outcome='unconfirmed';}}}location.assign(p.original);return done({ok:true,storageRestored:restored,storageOutcome:outcome,navigationDispatched:true});"));exit(0)
}
if mode=="verify_restore"{emit(execute("const k=kind();return done({ok:k==='inbox',atOriginalInbox:k==='inbox',pending:k==='privacy',changed:k==='changed'});"));exit(0)}
fail("mode")
