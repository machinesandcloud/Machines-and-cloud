import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url), out = new URL("assets/vendor/", root);
await mkdir(out, { recursive: true });
await build({ entryPoints: [new URL("practice-voice-sdk-entry.mjs", import.meta.url).pathname], outfile: new URL("vapi-web.js", out).pathname, bundle: true, format: "esm", platform: "browser", target: ["es2020"], minify: true, legalComments: "linked", drop: ["console", "debugger"], define: { "process.env.NODE_ENV": '"production"' } });
const notices = [];
for (const name of ["@vapi-ai/web", "@daily-co/daily-js", "events"]) {
  const directory = new URL(`node_modules/${name}/`, root);
  const pkg = JSON.parse(await readFile(new URL("package.json", directory), "utf8"));
  let license;
  try { license = await readFile(new URL("LICENSE", directory), "utf8"); }
  catch {
    license = `Upstream npm package declares SPDX license ${pkg.license}; no separate copyright notice or LICENSE file is included in that package. Source: ${pkg.repository?.url || pkg.homepage || ""}\n`;
    if (pkg.license === "MIT") license += "\n" + (await readFile(new URL("node_modules/events/LICENSE", root), "utf8")).replace(/Copyright Joyent, Inc\. and other Node contributors\.\n/, "");
  }
  notices.push(`${name} ${pkg.version} (${pkg.license})\n${license}`);
}
await writeFile(new URL("vapi-web-LICENSES.txt", out), notices.join("\n\n"));
console.log("VOICE SDK BUILT: pinned @vapi-ai/web3.0.0; local lazy-loaded bundle and upstream license notices");
