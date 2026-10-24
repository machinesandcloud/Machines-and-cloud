import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
const deny = () => { throw new Error('Physical transport is forbidden in the full-offer local gate.'); };
globalThis.fetch = deny;
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny;
syncBuiltinESMExports();
