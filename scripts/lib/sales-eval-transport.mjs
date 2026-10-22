// The evaluation allowlist checks the initial URL; refusing redirects keeps that boundary intact.
export function modelTransport(fetchImpl, input, init) {
  return fetchImpl(input, { ...init, redirect: 'error' });
}
