// Finite current-source controls for local drafts, never native engine/preset application.
const SOURCE='ffd31a735acc5721d1f90a30fc1ceb283aad6fc5',BANKS={CHICAGO:0,MIAMI:1,JUNO:3};
const copy=x=>structuredClone(x),integer=x=>Number.isSafeInteger(x),key=c=>[c.kind,c.target,c.voice,c.parameter,c.sourceBank].join(':');
// original_value_text in firmware ffd31a73 converts these unipolar pots to percent.
// Keep waveform names, bipolar envelope amounts, ADSR and selectors on their own paths.
const percentParameters = [
 new Set([1, 2, 3, 5, 6, 12, 18, 19]),          // Chicago
 new Set([1, 2, 4, 5, 8, 9, 10, 12, 14, 15]),  // Miami
];

export function knobPercent(raw) {
 return Math.floor((raw * 100 + 63) / 127);
}

export const unipolarPercent = raw => knobPercent(raw) + ' %';

export function sourcePercent(row, raw) {
 if (row?.kind !== 1 || row.target !== 2 || (row.voice !== 0 && row.voice !== 1) ||
     (row.sourceBank !== 0 && row.sourceBank !== 1) ||
     !percentParameters[row.sourceBank]?.has(row.parameter) || row.unit !== '%' ||
     !Number.isInteger(raw) || raw < 0 || raw > 127) return null;
 return unipolarPercent(raw);
}

export class SourceSounds{
 #groups=new Map();#controls=new Map();
 constructor(data,catalog){
  if(data?.schema!=='dnbox-current-source-sound-controls/1'||data.source!==SOURCE||data.runtimeAdmitted!==false||data.nativePointerContract!==false||catalog?.source!==SOURCE||!Array.isArray(data.contexts)||!Array.isArray(catalog.controls))throw Error('Exact finite source controls required');
  const expected=new Set(['CHICAGO:0','CHICAGO:1','MIAMI:0','MIAMI:1','JUNO:0','JUNO:1','BREAK:-1']);
  for(const group of data.contexts){
   const contextKey=group.bank+':'+group.bassSlot;
   if(!expected.delete(contextKey)||!Array.isArray(group.controls)||!group.controls.length)throw Error('Unknown or duplicate source context');
   const context=group.bank==='BREAK'?'BREAK':`BASS ${group.bassSlot?'B':'A'} / ${group.bank}`,rows=[],seen=new Set();
   for(const source of group.controls){
    const c=copy(source);if(![1,10,11,12,41,42,43].includes(c.kind)||![c.target,c.voice,c.parameter,c.sourceBank,c.min,c.max,c.raw,c.applied].every(integer)||c.min!==0||c.max<0||typeof c.name!=='string'||!c.name||typeof c.value!=='string'||typeof c.unit!=='string'||typeof c.readonly!=='boolean'||seen.has(key(c)))throw Error('Invalid source ref/snapshot');seen.add(key(c));
    let descriptor=null;
    if(c.kind===1){const matches=catalog.controls.filter(d=>d.kind!=='HELD'&&d.target===c.target&&d.voice===c.voice&&d.parameter===c.parameter&&d.sourceBank===c.sourceBank);if(matches.length!==1)throw Error('Unqualified bank/ref');descriptor=matches[0];if(descriptor.min!==c.min||descriptor.max!==c.max||descriptor.kind!=='U32'||(group.bank==='BREAK'?(c.target!==3||c.sourceBank!==-1):(c.target!==2||c.voice!==group.bassSlot||c.sourceBank!==BANKS[group.bank])))throw Error('Wrong source bank/domain');}
    const localUiRole=group.bank==='BREAK'&&((c.kind===10&&c.target===0&&c.voice===0&&c.parameter===9&&c.max===100)||(c.kind===11&&[0,1].includes(c.target)&&c.voice===0&&c.parameter===0&&c.max===3));
    const enabled=!c.readonly&&c.max>c.min&&c.raw>=c.min&&c.raw<=c.max&&Boolean(descriptor||localUiRole);
    const reason=enabled?'':c.kind===12&&c.max===0?(c.raw>c.max?'Captured INVALID: no loaded loop domain':'No loaded loop domain'):c.readonly?'Captured source status, read only':'Native engine/preset command unavailable';
    if(c.kind===1&&c.target===2&&(typeof c.sourceSection!=='string'||!c.sourceSection||!integer(c.sourcePage)||typeof c.sourceSectionObservation!=='string'))throw Error('Exact source section required');
    const rowContext=context+(c.sourceSection?' / '+c.sourceSection:'');
    const id='source-sound/'+group.bank+'/'+group.bassSlot+'|'+key(c),row={...c,id,label:c.name,context:rowContext,display:c.value+(c.unit?' '+c.unit:''),enabled,reason,step:1};rows.push(row);this.#controls.set(id,row);
   }
   this.#groups.set(contextKey,rows);
  }
  if(expected.size)throw Error('Missing source contexts');
  const actual=[...this.#controls.values()].filter(c=>c.kind===1&&c.target===2);if(actual.length!==104)throw Error('Incomplete current bass scalar coverage');
 }
 get runtimeAdmitted(){return false;}
 controls(bank,slot){const rows=this.#groups.get(bank+':'+slot);if(!rows)throw Error('Unknown current source bank/slot');return copy(rows);}
 controlForId(id){const row=this.#controls.get(id);return row?copy(row):null;}
 entries(){return copy([...this.#controls.values()]);}
 spec(id){const c=this.#controls.get(id);return c?.enabled?{id:c.id,label:c.label,context:c.context,value:c.raw,min:c.min,max:c.max,step:c.step}:null;}
}
