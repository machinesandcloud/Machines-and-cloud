// Background half of the scheduler: one fan-out kind over every live shop, outside the synchronous limit.
// Started by scheduler.mjs at the gated hour; also callable by admin with the key for tests.
import { fanout, KINDS } from "./lib/fanout.mjs";

export default async (req) => {
  if (process.env.ADMIN_KEY && req.headers.get("x-admin-key") !== process.env.ADMIN_KEY) return new Response("forbidden", { status: 403 });
  let body; try { body = await req.json(); } catch { return new Response("bad", { status: 400 }); }
  const kind = String(body?.kind || "");
  if (!KINDS.includes(kind)) return new Response("unknown kind", { status: 400 });
  const r = await fanout(kind);
  console.log("fanout", JSON.stringify(r));
  return new Response("ok");
};
