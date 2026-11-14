// SPDX-License-Identifier: GPL-3.0-only
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {extract,scenario,handshakeMatrix} from './fake-midi-harness.mjs';
const [mode,filename,output]=process.argv.slice(2),bytes=readFileSync(filename),source=extract(bytes.toString());
const r={event:mode==='negative'?'FIRST_HANDSHAKE_NEGATIVE_EXECUTED':'HANDSHAKE_MATRIX_EXECUTED',time_utc:new Date().toISOString(),filename,source_sha256:createHash('sha256').update(bytes).digest('hex')};
try{r.results=mode==='negative'?[await scenario(source,'echoed request must not mask later valid INFO',[{payload:[]},{}],1)]:await handshakeMatrix(source);r.status='PASS';}
catch(e){r.status='FAIL';r.error=e.message;process.exitCode=1;}
writeFileSync(output,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r,null,2));
