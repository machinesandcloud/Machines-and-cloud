import Foundation
import CoreFoundation
func sessionState(_ session:[String:Any]?)->String{
 guard let value=session?["CGSSessionScreenIsLocked"]as?NSNumber,CFGetTypeID(value)==CFBooleanGetTypeID() else{return "unknown"}
 return value.boolValue ? "locked" : "unlocked"
}
let cases:[([String:Any]?,String)] = [(nil,"unknown"),([:],"unknown"),(["CGSSessionScreenIsLocked":NSNumber(value:false)],"unlocked"),(["CGSSessionScreenIsLocked":NSNumber(value:true)],"locked"),(["CGSSessionScreenIsLocked":NSNumber(value:0)],"unknown"),(["CGSSessionScreenIsLocked":NSNumber(value:1)],"unknown"),(["CGSSessionScreenIsLocked":"false"],"unknown"),(["CGSSessionScreenIsLocked":NSNull()],"unknown")]
for (input,expected) in cases{precondition(sessionState(input)==expected)}
print("{\"passed\":8,\"failed\":0,\"sessionQueries\":0,\"nativeActions\":0}")
