// SPDX-License-Identifier: GPL-3.0-only
// Pure in-memory rendering only: no publication, catalog writes or device calls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderInstaller} from '../scripts/render-qualified-nightly.mjs';
const source=readFileSync(new URL('../web/fm1ota.js',import.meta.url),'utf8');
const strip=s=>s.replace(/^export\s+/gm,'').replace(/^import .*?;\r?\n/gm,'');
const html=renderInstaller({schema:1,versions:[],history:[]});
const begin=html.indexOf('const HS_QUERY =');
const end=html.indexOf('// SPDX-License-Identifier:',html.indexOf('  async resume',begin));
assert.ok(begin>=0 && end>begin);
const generated=html.slice(begin,end).trim();
assert.equal(generated,strip(source).slice(strip(source).indexOf('const HS_QUERY =')).trim(),'renderer must preserve the complete current OTA module');
export const otaRuntimes=[['source',strip(source)],['generated',generated]];
