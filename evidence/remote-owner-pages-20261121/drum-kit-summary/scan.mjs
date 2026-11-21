import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const source=resolve(process.argv[2], 'web/product-site/remote');
const native=readFileSync(process.argv[3],'utf8').trim().split('\n').slice(0,256).map(l=>l.split(' ').map(Number).slice(2));
const {paintDrumGlyph}=await import(pathToFileURL(source+'/drum-strip.mjs'));
const catalog=JSON.parse(readFileSync(source+'/components.json'));
let compared=0,worst=0;
const rows=[];
for(const screen of catalog.screens.filter(s=>s.path.includes('-voice-'))) {
 for(const control of screen.controls){
  const path={d:'retained',setAttribute(k,v){this.d=v;}};
  const g={setAttribute(){},querySelector:()=>path};
  const root={querySelectorAll:()=>[g]};
  const max=control.context.name==='Sound'?1:127;
  const paint=value=>{paintDrumGlyph(root,control,value,max);return path.d;};
  const low=paint(0),high=paint(max);
  const changed=low!==high;
  rows.push({screen:screen.path.split('/').pop(),id:control.identity,name:control.context.name,changed});
  if(changed && ['1:0:11:1','1:1:11:1'].includes(control.identity)){
   for(let raw=0;raw<=127;raw++){
    const values=[...paint(raw).matchAll(/M([\d.]+) ([\d.]+)V([\d.]+)/g)].flatMap(([,x,y,end])=>[+x,+y,+x,+end]);
    const target=native[(control.identity==='1:1:11:1'?128:0)+raw];
    assert.equal(values.length,target.length);
    for(let i=0;i<values.length;i++) {
     const difference=Math.abs(values[i]-target[i]);
     assert.ok(difference<.000055,`${control.identity} raw ${raw} coordinate ${i}: ${difference}`);
     worst=Math.max(difference,worst);compared++;
    }
   }
  }
 }
}
console.log(JSON.stringify({total:rows.length,changed:rows.filter(r=>r.changed).length,comparedCcoordinates:compared,worstDifferenceInSourceUnits:worst,rows},null,2));
