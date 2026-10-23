// Preloaded for every deploy-gate process. Harnesses may install protocol doubles;
// physical socket, HTTP, TLS and DNS escape paths remain disabled.
import net from 'node:net';import http from 'node:http';import https from 'node:https';import tls from 'node:tls';import dns from 'node:dns';
import {appendFileSync} from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
let attempts=0;const blocked=kind=>{attempts++;throw new Error('Required gate physical network denied: '+kind);};
globalThis.fetch=async()=>blocked('fetch without an in-process double');
net.connect=net.createConnection=()=>blocked('net');net.Socket.prototype.connect=function(){return blocked('socket');};
http.request=http.get=https.request=https.get=()=>blocked('http');tls.connect=()=>blocked('tls');
dns.lookup=dns.resolve=dns.resolve4=dns.resolve6=()=>blocked('dns');if(dns.promises){dns.promises.lookup=dns.promises.resolve=dns.promises.resolve4=dns.promises.resolve6=async()=>blocked('dns promise');}
syncBuiltinESMExports();process.on('exit',()=>{if(process.env.MC_REQUIRED_GUARD_LEDGER)appendFileSync(process.env.MC_REQUIRED_GUARD_LEDGER,JSON.stringify({command:process.env.MC_REQUIRED_COMMAND,pid:process.pid,deniedPhysicalAttempts:attempts})+'\n');});
