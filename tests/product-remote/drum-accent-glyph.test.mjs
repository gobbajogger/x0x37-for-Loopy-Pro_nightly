// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {paintDrumGlyph} from '../../web/product-site/remote/drum-strip.mjs';

const screens=JSON.parse(readFileSync(new URL('../../web/product-site/remote/components.json',import.meta.url)))
 .screens.filter(screen=>screen.path.includes('-voice-'));
const donor='M2 12V9M10 12V6M18 12V3M26 12V0';

test('both kits use the native four-tick curve only in their captured summary slots',()=>{
 assert.equal(screens.length,22);
 for(const screen of screens){
  const controls=screen.controls.filter(control=>['1:0:11:1','1:1:11:1'].includes(control.identity));
  assert.equal(controls.length,1);
  const [summary]=controls;
  assert.equal(summary.markers['visual-role'],'inactive bank parameter summary');
  const paths=[donor,donor];
  const glyphs=paths.map((_,i)=>({setAttribute(){},querySelector:()=>({setAttribute(name,value){assert.equal(name,'d');paths[i]=value;}})}));
  const root={querySelectorAll:()=>glyphs};
  for(const [raw,expected] of [[0,'M2 12V11M10 12V10M18 12V9M26 12V8'],
                               [127,donor]]){
   paintDrumGlyph(root,summary,raw,127);
   assert.deepEqual(paths,[expected,expected],screen.path);
  }
  // An enlarged, selected 808 KIT slot can have two peaks. The summary
  // renderer leaves the active bank and any unclassified presentation alone.
  const untouched={querySelectorAll(){assert.fail('Tried to change a non-summary glyph');}};
  for(const markers of [{'visual-role':'active glyph/value control'},{}]){
   paintDrumGlyph(untouched,{...summary,markers},0,127);
  }
 }
});
