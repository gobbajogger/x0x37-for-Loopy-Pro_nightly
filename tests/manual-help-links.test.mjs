// SPDX-License-Identifier: GPL-3.0-only
// Exact maintained-manual destinations, not browser or hardware validation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manual = 'https://github.com/gobbajogger/X0X37-for-Loopy-Pro/blob/main/docs/MANUAL.md';
for (const file of ['web/x0x_breaks.html', 'docs/breaks/index.html']) {
  const html = read(file);
  const href = html.match(/<a\s+href="([^"]+)"[^>]*>The manual's BREAK section<\/a>/)?.[1];
  assert.equal(href, `${manual}#8-break`, `${file}: BREAK help must reach the maintained section, not the local stub`);
}
for (const file of ['web/x0x_installer.html', 'docs/install/index.html']) {
  const html = read(file);
  const href = html.match(/<a\s+href="([^"]+)"[^>]*\bdata-t="bricklink"/)?.[1];
  assert.equal(href, `${manual}#recovering-an-fm-1-that-wont-start`, `${file}: existing troubleshooting help must reach the maintained section`);
}
for (const file of ['web/x0x_breaks.html', 'web/x0x_installer.html', 'docs/breaks/index.html', 'docs/install/index.html']) {
  assert.doesNotMatch(read(file), /href="\.\.\/manual\/#/, `${file}: local Manual is a landing stub, not a sectioned document`);
}
console.log('PASS: four source/generated help destinations and no nonexistent local-manual fragments');
