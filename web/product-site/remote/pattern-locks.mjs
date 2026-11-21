import {knobPercent,unipolarPercent} from './sound.mjs';

// Firmware 76040daa, ui_original_controls.h, ui.c (lockable, original_switch_turn)
// and motion.h (160 lanes). A lock is a stored parameter override on a part and pattern.
// BREAK Level uses pot/127 gain. Stock unit_value shows tenths below 10 dB
// of attenuation and rounds larger losses to whole decibels.
function breakGain(raw) {
  if (raw === 0) return 'OFF';
  const tenths = Math.round(-200 * Math.log10(raw / 127));
  const number = tenths >= 100 ? -Math.round(tenths / 10) : (-tenths / 10).toFixed(1);
  return number + 'dB';
}

const raw = Object.freeze(Array.from({length:128}, (_,i)=>i));
const names = ['Wave','Glide','Cutoff','Peak','Envelope','Bite','Gnaw','Attack','Decay',
  'Sustain','Release','Env/Gate','Level','Arp on','Arp mode','Arp range','Arp speed',
  'FX type','FX edit 1','FX edit 2'];
const selectors = new Map([
  [11,['ENV','GATE']], [13,['OFF','ON']], [14,['DOWN','UP','UP/DN']],
  [15,['1 OCT','2 OCT','FULL']], [16,['1/2','1/4D','1/2T','1/4','1/8D','1/4T','1/8','1/8T','1/16','1/32']],
]);
const effects = ['OFF','CHO/FLG','PHASER','RING MOD','COMPRESSOR','DECIMATOR',
  'EQ','ENSEM','SH DLY','BPM DL','HALL','GT REV'];

function chicagoDomain(parameter) {
  if (parameter===17) return Object.freeze(effects.map((_,index)=>index));
  const states=selectors.get(parameter);
  return states ? Object.freeze(states.map((_,index)=>Math.round(index*127/(states.length-1)))) : raw;
}

// Mirrors the original Chicago panel reported by web_sound_read in kernel 4758a957.
function chicagoValue(parameter, value) {
  if (parameter===0) return value===0?'SAW':value===127?'PUL':'SAW/PUL';
  if (parameter===4) {
    const normalized=value<64 ? value/128 : 0.5+(value-64)/126;
    const percent=Math.round(normalized*200)-100;
    return (percent>0?'+':'')+percent+'%';
  }
  if (parameter===17) return effects[value];
  const states=selectors.get(parameter);
  if (states) return states[Math.round(value*(states.length-1)/127)];
  return knobPercent(value)+'%';
}
const chicago=[0,1].flatMap(slot=>names.map((name,parameter)=>{
  const domain=chicagoDomain(parameter);
  return Object.freeze({id:4096+32*slot+parameter,part:slot+2,owner:slot?'Bass B':'Bass A',bank:'CHICAGO',
    parameter,label:name+' lock',domain,text:value=>chicagoValue(parameter,value)});
}));
const miami=[0,1].map(slot=>Object.freeze({
  id:4169+32*slot,part:slot+2,owner:slot?'Bass B':'Bass A',bank:'MIAMI',
  parameter:9,label:'Cutoff lock',domain:raw,text:unipolarPercent,
}));
const breakLevel=Object.freeze({id:1153,part:4,owner:'BREAK',bank:'BREAK',parameter:0,label:'Level lock',domain:raw,text:breakGain});
export const patternLockSpecs=Object.freeze([...chicago,...miami,breakLevel]);

export function lockField(part,banks,view,selected) {
  if(view!=='roll' && view!=='locks')return;
  if(part==='breaks')return selected===undefined||selected===breakLevel.id?breakLevel:undefined;
  const slot=part==='chicago'?0:part==='miami'?1:-1;
  if(slot<0)return;
  const bank=banks[slot],defaultId=bank==='MIAMI'?miami[slot].id:4098+32*slot;
  return patternLockSpecs.find(field=>field.part===slot+2 && field.bank===bank && field.id===(selected??defaultId));
}

// Factory controls may sit between a selector's authored detents. The native
// encoder rounds to the nearest state before moving left or right.
export function nudgeLock(field,value,direction) {
  const domain=field.domain;
  const at=Math.round(value/domain.at(-1)*(domain.length-1));
  return domain[Math.max(0,Math.min(domain.length-1,at+direction))];
}
const patternOK=n=>Number.isInteger(n)&&n>=0&&n<32;
const fail=()=>{throw Error('Local draft: invalid pattern lock');};
export function checkedPatternLocks(rows){
  if(!Array.isArray(rows)||rows.length>160)fail();
  const result=[],seen=new Set();
  for(const row of rows){
    const field = patternLockSpecs.find(f => f.id === row?.catalogId);
    if(!row||typeof row!=='object'||Object.keys(row).length!==3||
       !['catalogId','pattern','values'].every(key=>Object.hasOwn(row,key))||
       !field||!patternOK(row.pattern)||
       !Array.isArray(row.values)||row.values.length!==16||
       !Array.from(row.values).every(v=>v===null||field.domain.includes(v)))fail();
    const key=row.catalogId+'/'+row.pattern;
    if(seen.has(key))fail();seen.add(key);
    if(row.values.some(v=>v!==null))result.push({catalogId:row.catalogId,pattern:row.pattern,values:[...row.values]});
  }
  return result.sort((a,b)=>a.catalogId-b.catalogId||a.pattern-b.pattern);
}
export function putPatternLock(rows,catalogId,pattern,values){
  const entered=checkedPatternLocks([{catalogId,pattern,values}]);
  return checkedPatternLocks([...rows.filter(r=>r.catalogId!==catalogId||r.pattern!==pattern),...entered]);
}
