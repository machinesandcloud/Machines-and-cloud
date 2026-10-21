// Test-run preload: allow local HTTP fixtures only, including inherited child processes.
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";
const local = (host) => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
let rejected = 0;
function reject(host) { rejected++; throw new Error(`Sprint 9 offline guard blocked nonlocal network: ${host}`); }
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof first === "object" && first ? first.host || "localhost" : typeof args[1] === "string" ? args[1] : "localhost";
  if (typeof first === "string" || first?.path || !local(host)) reject(host);
  return connect.apply(this, args);
};
const fetch = globalThis.fetch;
globalThis.fetch = (input, ...args) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!local(url.hostname)) reject(url.hostname);
  return fetch(input, ...args);
};
syncBuiltinESMExports();
process.on("exit", () => { console.log(`OFFLINE GUARD: ${rejected} rejected nonlocal attempts`); if (rejected) process.exitCode = 1; });
