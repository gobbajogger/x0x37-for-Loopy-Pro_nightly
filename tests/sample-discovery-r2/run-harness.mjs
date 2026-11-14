// SPDX-License-Identifier: GPL-3.0-only
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {extract,scenario,matrix} from './fake-midi-harness.mjs';
const [mode, filename, output] = process.argv.slice(2);
const bytes=readFileSync(filename), source=extract(bytes.toString());
const receipt={mode,filename,time_utc:new Date().toISOString(),source_sha256:createHash('sha256').update(bytes).digest('hex'),function_sha256:createHash('sha256').update(source).digest('hex')};
try {
 receipt.results=mode==='negative' ? [await scenario(source,'first executed negative control: input-open rejection before good candidate',[{inputReject:true},{}],1)] : await matrix(source);
 receipt.status='PASS';
} catch(e) {receipt.status='FAIL';receipt.error=e.message;process.exitCode=1;}
writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
