// SPDX-License-Identifier: GPL-3.0-only
import {copy,getPart,KITS,STEPS_PER_BEAT,setBit,validateDraft,diffDraft,integer,gate} from './model.js';
export const LIMITS=Object.freeze({bytes:1048576,tracks:256,events:100000,tick:0x7fffffff});
export function parseSMF(input) {
  const a=input instanceof Uint8Array?input:new Uint8Array(input);
  if(a.length>LIMITS.bytes)throw new Error('MIDI file limit: 1 MiB.');
  let pos=0,events=0,count=0;
  const need=(n,end=a.length)=>{if(!integer(n,0,LIMITS.bytes)||pos+n>end)throw new Error('Truncated MIDI header, chunk or event.');};
  const byte=end=>{need(1,end);return a[pos++];};
  const u16=()=>byte()*256+byte();
  const u32=()=>((byte()*0x1000000)+(byte()<<16)+(byte()<<8)+byte())>>>0;
  const tag=()=>String.fromCharCode(byte(),byte(),byte(),byte());
  const vlq=end=>{let n=0;for(let i=0;i<4;i++){const v=byte(end);n=n*128+(v&127);if(!(v&128))return n;}throw new Error('MIDI VLQ limit: 4 bytes.');};
  if(tag()!=='MThd')throw new Error('Missing MThd MIDI header.');
  const h=u32();if(h<6)throw new Error('Invalid MIDI header length.');need(h);const headerEnd=pos+h;
  const format=u16(),ntracks=u16(),division=u16();
  if(format>1)throw new Error('Only SMF format 0 or 1 is supported.');
  if(!ntracks||ntracks>LIMITS.tracks||format===0&&ntracks!==1)throw new Error('MIDI track limit: 256; format 0 requires one track.');
  if(division&0x8000)throw new Error('SMPTE timing is unsupported. Use PPQN MIDI.');
  if(!division)throw new Error('PPQN division must be 1–32767.');pos=headerEnd;
  // Fixed typed columns bound note storage independently of malicious chunk sizes.
  const notes={start:new Uint32Array(LIMITS.events),end:new Uint32Array(LIMITS.events),pitch:new Uint8Array(LIMITS.events),velocity:new Uint8Array(LIMITS.events),channel:new Uint8Array(LIMITS.events),track:new Uint16Array(LIMITS.events)};
  const tracks=[],global={tempo:0,meter:0,sysex:0};
  for(let t=0;t<ntracks;t++) {
    if(tag()!=='MTrk')throw new Error('Expected an MTrk chunk.');const length=u32();need(length);const end=pos+length;
    const tr={name:`Track ${t+1}`,channels:[],issues:[],issueMask:0,unsupported:{controller:0,program:0,otherChannel:0,sysex:0}};
    const channels=new Set(),active=new Int32Array(2048).fill(-1);let tick=0,running=0,eot=false;
    const issue=(ch,msg)=>{tr.issueMask|=1<<ch;if(tr.issues.length<32)tr.issues.push({channel:ch,message:msg});};
    while(pos<end) {
      if(++events>LIMITS.events)throw new Error('MIDI event limit: 100000.');tick+=vlq(end);if(tick>LIMITS.tick)throw new Error('MIDI tick limit: 2147483647.');
      let st=byte(end);if(st<128){if(!running)throw new Error('Running status has no channel status.');pos--;st=running;}
      if(st>=0x80&&st<=0xef) {
        running=st;const ty=st>>4,ch=st&15,d1=byte(end),d2=ty===12||ty===13?0:byte(end);if(d1>127||d2>127)throw new Error('MIDI channel data must be 7 bit.');channels.add(ch);
        if(ty===9&&d2) {
          const k=ch*128+d1;if(active[k]>=0){issue(ch,'Overlapping repeated pitch has an ambiguous lifetime.');continue;}
          const i=count++;notes.start[i]=tick;notes.end[i]=tick;notes.pitch[i]=d1;notes.velocity[i]=d2;notes.channel[i]=ch;notes.track[i]=t;active[k]=i;
        } else if(ty===8||ty===9) {
          const k=ch*128+d1,i=active[k];if(i<0)issue(ch,'Unmatched note release.');else {notes.end[i]=tick;if(tick<=notes.start[i])issue(ch,'A note has zero duration.');active[k]=-1;}
        } else if(ty===11)tr.unsupported.controller++;
        else if(ty===12)tr.unsupported.program++;
        else tr.unsupported.otherChannel++;
      } else if(st===0xff) {
        running=0;const type=byte(end),n=vlq(end);need(n,end);
        if(type===0x2f){if(n!==0)throw new Error('Invalid end-of-track length.');eot=true;if(pos!==end)throw new Error('Data follows end-of-track.');break;}
        if(type===3)tr.name=new TextDecoder().decode(a.subarray(pos,pos+Math.min(n,256))).replace(/[\x00-\x1f\x7f]/g,'').slice(0,128)||tr.name;
        if(type===0x51){if(n!==3)throw new Error('Invalid tempo metadata.');global.tempo++;}
        if(type===0x58){if(n!==4)throw new Error('Invalid meter metadata.');global.meter++;}
        pos+=n;
      } else if(st===0xf0||st===0xf7){running=0;const n=vlq(end);need(n,end);pos+=n;tr.unsupported.sysex++;global.sysex++;}
      else throw new Error('Unsupported system event in MIDI file.');
    }
    if(!eot)throw new Error('MIDI track has no end-of-track.');
    for(let k=0;k<2048;k++)if(active[k]>=0)issue(k>>>7,'A note has no release before end-of-track.');
    tr.channels=[...channels].sort((x,y)=>x-y);tracks.push(tr);
  }
  if(pos!==a.length)throw new Error('Unexpected trailing MIDI chunks/data.');
  return {format,ppqn:division,tracks,global,events,count,notes};
}
export function makeImportPlan(parsed,doc,revision,settings) {
  validateDraft(doc);
  const {pattern,part,track,channel,rate,startBeat,beats}=settings;
  if(!integer(pattern,0,31)||!integer(part,0,3)||!integer(track,0,parsed.tracks.length-1)||!integer(channel,0,15)||!integer(rate,0,3)||!integer(startBeat,1,1e6)||!integer(beats,1,64))throw new Error('Invalid import mapping/window.');
  const length=beats*STEPS_PER_BEAT[rate];if(length>64)throw new Error('This window maps beyond 64 steps. Choose a smaller window or rate.');
  // The first preserved TIE can depend on a NOTE inside the replacement window.
  // Reject before mapping; never extend the imported note or clear outside cells.
  if(part<2&&length<64&&gate(getPart(doc,pattern,part).steps[length])===2)return {
    kind:'midi',revision,settings:copy(settings),
    errors:['Destination TIE dependency crosses the replacement window. Choose a window covering the complete destination note.'],
    losses:[],notices:['No replacement candidate was generated. Source mapping was not evaluated; the entire draft and outside cells are unchanged.'],
    requiresAcceptance:false,counts:null,changes:[],candidate:copy(doc)
  };
  const tr=parsed.tracks[track],start=(startBeat-1)*parsed.ppqn,end=start+beats*parsed.ppqn,spb=STEPS_PER_BEAT[rate];
  const errors=[],losses=[],notices=[],excluded=[],source=[];let moved=0,releases=0,unmapped=0;
  if(tr.issueMask&(1<<channel))errors.push('Selected source has unmatched, zero-duration or ambiguous note lifetimes.');
  for(let i=0;i<parsed.count;i++)if(parsed.notes.track[i]===track&&parsed.notes.channel[i]===channel){
    const n={event:i,start:parsed.notes.start[i],end:parsed.notes.end[i],pitch:parsed.notes.pitch[i],velocity:parsed.notes.velocity[i]};
    if(n.end<=start||n.start>=end){excluded.push(n);continue;}
    if(n.start<start||n.end>end){errors.push('A held note crosses the source window. Choose a complete-note window.');continue;}
    source.push(n);
  }
  if(!source.length)errors.push('No complete notes/hits on this track/channel in the chosen window.');
  source.sort((a,b)=>a.start-b.start||a.event-b.event);
  if(part<2)for(let i=1,latest=-1;i<source.length;i++){latest=Math.max(latest,source[i-1].end);if(source[i].start<latest){errors.push('Melodic source is polyphonic. Choose another track/channel; no automatic reduction.');break;}}
  const candidate=copy(doc),target=getPart(candidate,pattern,part),oldLength=target.length;target.length=length;target.rate=rate;
  if(part<2)for(let i=0;i<length;i++)target.steps[i]={note:target.steps[i].note,flags:0,velocity:target.steps[i].velocity};
  else for(let v=0;v<11;v++)for(let i=0;i<length;i++)setBit(target.hits[v],i,false);
  let latestRelease=-1;const occupied=new Set(),mapped=[];
  for(const n of source) {
    const exact=(n.start-start)*spb/parsed.ppqn,s=Math.round(exact);
    if(s>=length){errors.push('Quantized onset exceeds the selected step window.');continue;}
    if(Math.abs(s-exact)>1e-8)moved++;
    if(part>=2) {
      const v=KITS[part-2].findIndex(x=>x[1]===n.pitch);if(v<0){unmapped++;losses.push({kind:'unmapped GM note',...n});continue;}
      const key=v+':'+s;if(occupied.has(key)){errors.push('Quantized drum hits collide on the same voice and step.');continue;}occupied.add(key);setBit(target.hits[v],s,true);mapped.push(n);continue;
    }
    const off=(n.end-start)*spb/parsed.ppqn,last=Math.ceil(off)-1,ep=Math.max(1,Math.min(15,Math.round((off-last)*16))),effective=last+ep/16;
    if(s<=latestRelease||last<s||effective<=s){errors.push('Quantization collapses or overlaps melodic notes. Choose a finer rate or another source.');continue;}
    latestRelease=last;
    if(Math.abs(effective-off)>1e-8){releases++;losses.push({kind:'release rounded',...n,releaseSlotBefore:off,releaseSlotAfter:effective});}
    if(Math.abs(s-exact)>1e-8)losses.push({kind:'onset rounded',...n,stepBefore:exact,stepAfter:s});
    target.steps[s]={note:n.pitch,flags:1,velocity:n.velocity};
    for(let j=s+1;j<=last;j++)target.steps[j]={note:n.pitch,flags:2,velocity:n.velocity};
    target.steps[last].flags|=ep<<4;mapped.push(n);
  }
  if(part>=2&&source.length)losses.push({kind:'per-hit velocities not stored',count:source.length,detail:'Hit positions only; total accent and existing auxiliary lanes stay unchanged.'});
  if(excluded.length)losses.push({kind:'outside selected window',count:excluded.length,events:excluded});
  const unsupported={...tr.unsupported,tempo:parsed.global.tempo,meter:parsed.global.meter};
  if(Object.values(unsupported).some(Boolean))losses.push({kind:'metadata/control data not transferred',counts:unsupported});
  if(oldLength!==length)notices.push(`Local part length ${oldLength} → ${length}; preserved latent data may become active.`);
  notices.push('Replacement affects only the selected local part/window; hidden steps outside it and other parts are preserved.');
  if(part>=2&&moved)notices.push(`${moved} drum onset(s) move to the selected grid.`);
  validateDraft(candidate);
  return {kind:'midi',revision,settings:copy(settings),errors:[...new Set(errors)],losses,notices,requiresAcceptance:losses.length>0||moved>0,counts:{source:source.length,mapped:mapped.length,excluded:excluded.length,unmapped,onsetsRounded:moved,releasesRounded:releases,steps:length},changes:diffDraft(doc,candidate),candidate};
}
