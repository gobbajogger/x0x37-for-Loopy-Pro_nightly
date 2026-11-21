import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFunkyBeatsLauncher} from '../../web/product-site/remote/funkybeats-view.mjs';
const parts=['909','808','Bass A','Bass B','BREAK'],targets=[0,null,31,5,null];
test('selected-part projection preserves original channel/pattern identities and all five targets',()=>{
 const before=structuredClone(targets);
 for(let part=0;part<5;part++){
  const html=renderFunkyBeatsLauncher({parts,targets,selectedPart:part});
  assert.equal((html.match(/data-launch-part=/g)||[]).length,32);
  assert.equal((html.match(new RegExp('data-launch-part="'+part+'"','g'))||[]).length,32);
  assert.equal((html.match(/aria-pressed="true"/g)||[]).length,targets[part]===null?0:1);
  assert.ok(html.includes(parts[part]+' P32, not loaded'));
  assert.doesNotMatch(html,/queued|playing|next bar|AudioContext/);
 }
 assert.deepEqual(targets,before);
 assert.equal((renderFunkyBeatsLauncher({parts,targets}).match(/data-launch-part=/g)||[]).length,160);
});
test('selected-part projection rejects unknown part scope without mutating targets',()=>{
 for(const selectedPart of [-1,5,1.5,'2'])assert.throws(()=>renderFunkyBeatsLauncher({parts,targets,selectedPart}));
 assert.deepEqual(targets,[0,null,31,5,null]);
});
