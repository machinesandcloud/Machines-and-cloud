// Loader hook for owner-notes-check.mjs: the copy's fake-model import (from agent.mjs, and from the
// onboarding build step) goes to a recorder that wraps the copy's own fake model, so the real system
// prompt and first user message each caller sends can be captured.
const CALLERS = [["./fake-model.mjs", "/netlify/functions/lib/agent.mjs"], ["./lib/fake-model.mjs", "/netlify/functions/onboard-build-background.mjs"]];
export async function resolve(specifier, context, next) {
  if (CALLERS.some(([s, p]) => specifier === s && context.parentURL?.endsWith(p))) {
    const real = new URL(specifier, context.parentURL).href;
    return { url: new URL("./owner-notes-recorder.mjs", import.meta.url).href + "?real=" + encodeURIComponent(real), shortCircuit: true };
  }
  return next(specifier, context);
}
