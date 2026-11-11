import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const [,, src, out, zipDir] = process.argv;
let code = readFileSync(src, 'utf8').replace('window.MCWebsiteInstall={', 'window.__p={embedSource:embedSource,configuredEmbed:configuredEmbed};window.MCWebsiteInstall={');
let snippetText = '';
const doc = { getElementById: id => id === 'snippet' ? { textContent: snippetText } : null, addEventListener() {}, body: { dataset: {} } };
const win = {};
const ctx = vm.createContext({ window: win, document: doc, sessionStorage: { getItem: () => null }, crypto: globalThis.crypto, TextEncoder, URL, Map, JSON, Math, String, Number, Array, Uint8Array, DataView, Error, Object, setTimeout, matchMedia: () => ({}) });
vm.runInContext(code, ctx);
const P = win.__p, W = win.MCWebsiteInstall, r = { embedSource: [], configured: [], php: [], handoff: {} };
const cases = ['https://machinesandcloud.com/embed.js','https://www.machinesandcloud.com/embed.js','https://deploy-preview-42--machinesandcloud.netlify.app/embed.js','https://main--machinesandcloud.netlify.app/embed.js','https://machinesandcloud.com//embed.js','https://machinesandcloud.com/sub/embed.js','https://xn--bcher-kva.example/embed.js','https://Machinesandcloud.COM/embed.js','https://machinesandcloud.com:8443/embed.js','http://localhost:8888/embed.js','http://127.0.0.1:8947/embed.js','http://[::1]:8888/embed.js','http://machinesandcloud.com/embed.js','http://127.0.0.2/embed.js','https://u:p@machinesandcloud.com/embed.js','https://machinesandcloud.com/embed.js?x=1','https://machinesandcloud.com/embed.js#a','https://machinesandcloud.com/embed.js#','https://machinesandcloud.com/embed.js?','undefined/embed.js','https://machinesandcloud.com/embed.jsx','https://machinesandcloud.com/%2e%2e/embed.js','https://machinesandcloud.com/../embed.js','javascript:alert(1)//embed.js','https://a\'b.com/embed.js','https://a$b.com/embed.js','https://a&b.com/embed.js'];
for (const c of cases) { try { r.embedSource.push([c, 'OK', P.embedSource(c)]); } catch (e) { r.embedSource.push([c, 'REJECT', e.message]); } }
// production-like #snippet values exactly as desk.js:1021 renders them
const snip = (site, slug) => '<script src="' + site + '/embed.js" data-client="' + slug + '" async></script>';
const sites = ['https://machinesandcloud.com', 'https://machinesandcloud.com/', 'https://deploy-preview-42--machinesandcloud.netlify.app', undefined, 'http://localhost:8888'];
for (const site of sites) for (const slug of ['acme-hvac-3f9a', 'shop-00ff', 'a']) {
  snippetText = snip(site, slug);
  try { r.configured.push([site, slug, 'OK', P.configuredEmbed({ slug, code: '' })]); } catch (e) { r.configured.push([site, slug, 'REJECT', e.message]); }
}
snippetText = ' \n' + snip('https://machinesandcloud.com', 'acme-hvac-3f9a') + '\n '; try { r.configured.push(['whitespace-padded', 'OK', P.configuredEmbed({ slug: 'acme-hvac-3f9a' })]); } catch (e) { r.configured.push(['whitespace-padded', 'REJECT']); }
snippetText = snip('https://machinesandcloud.com', 'other-slug'); try { P.configuredEmbed({ slug: 'acme-hvac-3f9a' }); r.configured.push(['slug mismatch', 'OK?!']); } catch { r.configured.push(['slug mismatch', 'REJECT']); }
snippetText = ''; try { r.configured.push(['empty #snippet -> options.code fallback', 'OK', P.configuredEmbed({ slug: 'acme-hvac-3f9a', code: snip('https://machinesandcloud.com', 'acme-hvac-3f9a') })]); } catch { r.configured.push(['fallback', 'REJECT']); }
for (const slug of ['Acme', 'acme_hvac', 'acme.hvac', '-acme', "a'b", 'a'.repeat(63), 'a'.repeat(64)]) { try { W.php(slug, 'https://machinesandcloud.com/embed.js'); r.php.push([slug, 'OK']); } catch (e) { r.php.push([slug, 'REJECT', e.message]); } }
for (const [name, slug, s] of [['prod', 'acme-hvac-3f9a', 'https://machinesandcloud.com/embed.js'], ['preview', 'shop-00ff', 'https://deploy-preview-42--machinesandcloud.netlify.app/embed.js'], ['quote-host', 'shop-00ff', "https://a'b.com/embed.js"]]) {
  try { const z = W.zip(slug, s); writeFileSync(zipDir + '/' + name + '.zip', z); writeFileSync(zipDir + '/' + name + '.php', W.php(slug, s)); r.php.push(['zip:' + name, 'WROTE']); } catch (e) { r.php.push(['zip:' + name, 'REJECT', e.message]); }
}
for (const b of ['wordpress', 'wix', 'squarespace', 'webflow', 'shopify', 'other', 'unknown']) r.handoff[b] = W.instructions(b);
writeFileSync(out, JSON.stringify(r, null, 1)); console.log(JSON.stringify(r, null, 1));
