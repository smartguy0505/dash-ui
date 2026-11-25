// Some of the browser checks: node test/only.mjs 1.17 runs the parts of behaviour.mjs whose "// ---- …" line has that in it.
// (Parts from 1.10 on stand on their own; for older ones run the whole file.)
import { spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const want = process.argv.slice(2).join(' ').toLowerCase();
const text = await readFile(new URL('./behaviour.mjs', import.meta.url), 'utf8');
const end = text.lastIndexOf('\nawait browser.close();');
const starts = [...text.slice(0, end).matchAll(/^\/\/ ---- .*$/gm)].map((m) => ({ at: m.index, name: m[0].slice(8) }));
const parts = starts.map((s, i) => ({ ...s, text: text.slice(s.at, starts[i + 1]?.at ?? end) }));
const picked = want ? parts.filter((p) => p.name.toLowerCase().includes(want)) : [];
if (!picked.length) {
  console.log(`${want ? `No part has "${want}" in its name. ` : ''}The parts:\n${parts.map((p) => '  ' + p.name).join('\n')}`);
  process.exit(2);
}
const file = fileURLToPath(new URL(`./.only-${process.pid}.mjs`, import.meta.url));
await writeFile(file, text.slice(0, parts[0].at) + picked.map((p) => p.text).join('\n') + text.slice(end));
const run = spawn(process.execPath, [file], { stdio: 'inherit' });
const clean = async (code) => { await rm(file, { force: true }); process.exit(code ?? 1); };
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { run.kill(); clean(1); });
run.on('exit', clean);
