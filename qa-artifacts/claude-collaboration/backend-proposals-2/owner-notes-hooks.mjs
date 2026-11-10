// Loader hook for owner-notes-check.mjs: agent.mjs's "./fake-model.mjs" import goes to a recorder that
// wraps the repo's own fake model, so the real system prompt each handler sends can be captured.
export async function resolve(specifier, context, next) {
  if (specifier === "./fake-model.mjs" && context.parentURL?.endsWith("/netlify/functions/lib/agent.mjs")) {
    const real = new URL("./fake-model.mjs", context.parentURL).href;
    return { url: new URL("./owner-notes-recorder.mjs", import.meta.url).href + "?real=" + encodeURIComponent(real), shortCircuit: true };
  }
  return next(specifier, context);
}
