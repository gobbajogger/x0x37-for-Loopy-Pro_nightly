// Compare the production painter against every coordinate emitted by the compiled renderer.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const remote=resolve(process.argv[2],'web/product-site/remote');
const {paintDrumGlyph}=await import(pathToFileURL(remote+'/drum-strip.mjs'));
const {decayCurves}=await import(pathToFileURL(remote+'/drum-decay-times.mjs'));
const {screens}=JSON.parse(readFileSync(remote+'/components.json','utf8'));
const rows=new Map();
for(const line of readFileSync(process.argv[3],'utf8').trim().split('\n')){
  const [id,value,unit,ms,...points]=line.split(' ');
  if(!rows.has(id))rows.set(id,[]);
  rows.get(id).push({value:Number(value),unit,ms:Number(ms),points:points.map(Number)});
}
const controls=screens.filter(s=>s.path.includes('-voice-')).flatMap(s=>s.controls);
assert.equal(controls.length,83);
const results=[];
let compared=0,worst=0,changed=0;
function target(control){
  const path={d:'retained',setAttribute(key,value){assert.equal(key,'d');this.d=value;}};
  const glyph={setAttribute(k,v){assert.equal(k,'data-glyph-origin');assert.equal(v,'firmware dv_glyph');},
               querySelector(q){assert.equal(q,'path');return path;}};
  const selector='[data-source-control="'+control.identity+'"] [data-glyph-semantic]';
  const root={querySelectorAll(q){
    assert.equal(q,'[data-drum-editor] '+selector+', [data-drum-sound-strip] '+selector);return [glyph];
  }};
  return raw=>{paintDrumGlyph(root,control,raw,127);return path.d;};
}
for(const c of controls){
  const paint=target(c),low=paint(0),high=paint(127);
  if(low!==high)changed++;
  const expected=rows.get(c.identity);
  if(!expected)continue;
  assert.equal(expected.length,130);
  assert.notEqual(low,high,c.identity);
  for(const {value,points} of expected){
    const actual=[...paint(value).matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].flatMap(m=>[+m[1],+m[2]]);
    assert.equal(actual.length,34);
    for(let i=0;i<points.length;i++){
      const error=Math.abs(actual[i]-points[i]);
      assert.ok(error<.000055,`${c.identity} at ${value}, coordinate ${i}: ${error}`);
      worst=Math.max(worst,error);compared++;
    }
  }
  // The captured role and identity both have to qualify.
  const other={...c,markers:{...c.markers,'visual-role':'unqualified'}};
  assert.equal(target(other)(0),'retained');
  const unit=expected[0].unit;
  results.push({identity:c.identity,sourceTimeUnit:unit==='raw'?null:unit,
    durationMode:unit==='raw'?'normalized pot':'physical time',
    milliseconds:unit==='raw'?null:[expected[0].ms,expected[127].ms]});
}
assert.equal(changed,70);
assert.equal(results.length,20);assert.equal(Object.keys(decayCurves).length,20);
assert.equal(compared,88400);
assert.equal(target(controls.find(c=>c.identity==='1:1:6:2'))(127),'retained');
console.log(JSON.stringify({totalOccurrences:83,changing:changed,decayOccurrences:results.length,
  integerCoordinates:20*128*34,fractionalCoordinates:20*2*34,compared,worst,results},null,2));
