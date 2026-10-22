// Pinned official Vapi Web SDK. REST creation stays in our abortable same-origin bridge;
// the public reconnect(webCall) method joins the server-created Daily room.
import SDK from "@vapi-ai/web";
const Vapi = typeof SDK === "function" ? SDK : SDK.default;
export default Vapi;
