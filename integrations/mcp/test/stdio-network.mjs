// Test preload only: production code has no mock/environment bypass.
import './network-block.mjs';
import assert from 'node:assert/strict';
import { bearer, slug, fixture, jsonResponse } from './fixtures.mjs';
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), `https://machinesandcloud.com/api/client?c=${slug}&setup_assistance=1`);
  assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, 'Bearer ' + bearer);
  assert.equal(init.credentials, 'omit'); assert.equal(init.body, undefined);
  return jsonResponse(fixture());
};
