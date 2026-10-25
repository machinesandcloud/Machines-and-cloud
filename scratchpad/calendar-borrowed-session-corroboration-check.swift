import Foundation
import CoreFoundation
struct ForegroundFacts{let pid:Int32;let bundle:String?;let running:Bool;let regular:Bool}
func strictSessionBoolean(_ value:Any?)->Bool?{guard let n=value as?NSNumber,CFGetTypeID(n)==CFBooleanGetTypeID()else{return nil};return n.boolValue}
func sessionState(_ session:[String:Any]?,foreground:ForegroundFacts?)->String{
 guard let session else{return "unknown"}
 let lockPresent=session.keys.contains("CGSSessionScreenIsLocked")
 let lock=strictSessionBoolean(session["CGSSessionScreenIsLocked"])
 if lockPresent{guard let lock else{return "unknown"};if lock{return "locked"}}
 guard strictSessionBoolean(session["kCGSessionLoginDoneKey"])==true,strictSessionBoolean(session["kCGSSessionOnConsoleKey"])==true else{return "unknown"}
 if lockPresent{return "unlocked"}
 guard let foreground,foreground.pid>0,foreground.running,foreground.regular,let bundle=foreground.bundle,!bundle.isEmpty,bundle != "com.apple.loginwindow" else{return "unknown"}
 return "unlocked"
}
let yes=NSNumber(value:true),no=NSNumber(value:false)
let good=ForegroundFacts(pid:704,bundle:"example.regular.app",running:true,regular:true)
func base(_ lock:Any?=nil)->[String:Any]{var d:[String:Any]=["kCGSessionLoginDoneKey":yes,"kCGSSessionOnConsoleKey":yes];if let lock{d["CGSSessionScreenIsLocked"]=lock};return d}
var checks=0
func check(_ d:[String:Any]?,_ f:ForegroundFacts?,_ expected:String){precondition(sessionState(d,foreground:f)==expected);checks+=1}
check(nil,good,"unknown");check([:],good,"unknown")
check(["CGSSessionScreenIsLocked":yes],nil,"locked")
check(["CGSSessionScreenIsLocked":yes,"kCGSessionLoginDoneKey":no],good,"locked")
check(base(no),nil,"unlocked");check(base(no),good,"unlocked")
for value:Any in [NSNull(),NSNumber(value:0),NSNumber(value:1),"false"]{check(base(value),good,"unknown")}
check(base(),good,"unlocked");check(base(),nil,"unknown")
for f in [ForegroundFacts(pid:0,bundle:"example.app",running:true,regular:true),ForegroundFacts(pid:704,bundle:nil,running:true,regular:true),ForegroundFacts(pid:704,bundle:"",running:true,regular:true),ForegroundFacts(pid:421,bundle:"com.apple.loginwindow",running:true,regular:true),ForegroundFacts(pid:704,bundle:"example.app",running:false,regular:true),ForegroundFacts(pid:704,bundle:"example.app",running:true,regular:false)]{check(base(),f,"unknown")}
for key in ["kCGSessionLoginDoneKey","kCGSSessionOnConsoleKey"]{
 for lock:Any? in [nil,no]{var d=base(lock);d.removeValue(forKey:key);check(d,good,"unknown");for value:Any in [no,NSNumber(value:1),"true",NSNull()]{var d=base(lock);d[key]=value;check(d,good,"unknown")}}
}
print("{\"passed\":\(checks),\"failed\":0,\"CGSessionQueries\":0,\"foregroundQueries\":0,\"nativeActions\":0}")
