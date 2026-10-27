import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const [site,firmware] = process.argv.slice(2);
function body(path) { return readFileSync(path,'utf8').match(/function parseIdentity\(pkt\) \{[\s\S]*?\n\}/)[0]; }
assert.equal(body(site),body(firmware),'site/native-browser parser bodies must match');
const {pack7,unpack7}=await import(pathToFileURL(site));
const parse = new Function('pack7','unpack7',body(site)+'\nreturn parseIdentity;')(pack7,unpack7);
const cases=JSON.parse(readFileSync(0,'utf8'));
for(const c of cases) assert.equal(parse(c.frame)?.text ?? null,c.expected,c.label);
console.log('PASS site/firmware mirror byte-identical parser bodies and '+cases.length+' independently generated contract/single-bit mutation cases');
