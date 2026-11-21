// SPDX-License-Identifier: GPL-3.0-only
// Source-qualified local presentation/model only. Never native admission.
import source from './master-source.mjs';
const names=['Threshold','Ratio','Attack','Release','Makeup','Mix','Pump','Pump source','Filter mode','Cutoff','Resonance','Limiter','COMP','FILTER'];
const glyphs=['THRESH','RATIO','ATTACK','RELEASE','MAKEUP','MIX','PUMP','PUMP','FILTER','CUTOFF','RES','LIMIT','COMP','FILTER'];
const moreKeys=['6:0','6:1','6:2','6:3','6:4','6:5','6:7','6:10','6:11','4:1','4:3','4:0'];
export function createMasterDraft(components,catalog){
 if(catalog?.source!==source.source||source.schema!=='dnbox-master-draft-source/1'||source.runtime_admitted!==false||source.source!=='ffd31a735acc5721d1f90a30fc1ceb283aad6fc5'||source.controls.length!==18||source.macros.length!==128)throw Error('Unqualified Master source');
 const prefix='source-master/'+source.source+'/',byId=new Map(),groups=new Map();
 const id=(target,parameter)=>prefix+target+'/0/'+parameter;
 for(const c of source.controls){const key=c.target+':'+c.parameter,canonical=id(c.target,c.parameter),rows=catalog.controls.filter(d=>d.target===c.target&&d.voice===0&&d.parameter===c.parameter);
  if(groups.has(key)||rows.length!==1||rows[0].kind!=='U32'||rows[0].min!==0||rows[0].max!==c.max||!Number.isInteger(c.default)||c.default<0||c.default>c.max||c.displays.length!==c.max+1||c.displays.some(v=>typeof v!=='string'||!v||v.length>32))throw Error('Master source/catalog identity mismatch');
  const g={...c,id:canonical,ids:[canonical],min:0,step:1,value:c.default,label:c.target===6?names[c.parameter]:['Volume','Distortion','Drive','Glue'][c.parameter],glyph:c.target===6?glyphs[c.parameter]:['LEVEL','DIST','DRIVE','GLUE'][c.parameter],context:c.target===6?'Master':'Master FX',runtime_admitted:false};groups.set(key,g);byId.set(canonical,g);
 }
 for(const screen of components.screens)for(const c of screen.controls){const m=/^1:([46]):0:(\d+)$/.exec(c.identity);if(!m)continue;const g=groups.get(m[1]+':'+m[2]);if(!g)continue;if(Number(c.context.raw)!==g.value)throw Error('Master captured/source baseline drift');const alias=screen.path+'|'+c.identity;if(byId.has(alias)&&byId.get(alias)!==g)throw Error('Master alias identity conflict');if(!g.ids.includes(alias))g.ids.push(alias);byId.set(alias,g);}
 const valid=(g,value)=>Number.isInteger(value)&&value>=0&&value<=g.max;
 const group=key=>{const g=byId.get(key);if(!g)throw Error('Unknown Master identity');return g;};
 const read=(key,edits)=>{const g=group(key),values=g.ids.filter(k=>edits.has(k)).map(k=>edits.get(k));if(values.some(v=>!valid(g,v)||v!==values[0]))throw Error('Conflicting Master aliases');return values.length?values[0]:g.value;};
 const normalize=parameters=>{
  const edits=new Map();for(const p of parameters){if(edits.has(p.id))throw Error('Duplicate parameter');if(p.id.startsWith('source-master/')&&!byId.has(p.id))throw Error('Unknown pinned Master identity');edits.set(p.id,p.value);}
  if(![...byId.keys()].some(k=>edits.has(k)))return parameters.map(p=>({...p}));
  const explicit=[...groups.values()].filter(g=>edits.has(g.id));if(explicit.length&&explicit.length!==groups.size)throw Error('Incomplete pinned Master snapshot');
  const values=new Map([...groups.values()].map(g=>[g.id,read(g.id,edits)]));
  if(!explicit.length){for(const [macro,fields,offset]of[[12,[0,1,4],0],[13,[8,9],3]]){const g=group(id(6,macro));if(!g.ids.some(k=>edits.has(k))||values.get(g.id)===g.value)continue;const map=source.macros[values.get(g.id)];for(let n=0;n<fields.length;n++){const detail=group(id(6,fields[n]));if(detail.ids.some(k=>edits.has(k))&&read(detail.id,edits)!==map[n+offset])throw Error('Conflicting legacy Master macro/detail');values.set(detail.id,map[n+offset]);}}}
  for(const g of groups.values())for(const k of g.ids)edits.set(k,values.get(g.id));return [...edits].map(([id,value])=>({id,value}));
 };
 const change=(key,edits,value)=>{const g=group(key);if(!valid(g,value))throw Error('Master value outside source domain');const before=[...edits],next=new Map(edits),values=new Map([...groups.values()].map(g=>[g.id,read(g.id,edits)]));values.set(g.id,value);if(g.target===6&&[12,13].includes(g.parameter)){const map=source.macros[value],fields=g.parameter===12?[0,1,4]:[8,9],offset=g.parameter===12?0:3;for(let i=0;i<fields.length;i++)values.set(id(6,fields[i]),map[offset+i]);}
  for(const row of groups.values())for(const alias of row.ids)next.set(alias,values.get(row.id));
  const install=rows=>{const current=new Map(edits),result=new Map();for(const[k,v]of rows){if(byId.has(k))result.set(k,v);else if(current.has(k))result.set(k,current.get(k));}for(const[k,v]of current)if(!byId.has(k)&&!result.has(k))result.set(k,v);edits.clear();for(const[k,v]of result)edits.set(k,v);};return{redo:()=>install(next),undo:()=>install(before)};
 };
 const specs=[...groups.values()].map(g=>({...g,ids:[...g.ids]}));
 return{runtime_admitted:false,id,specs,more:moreKeys.map(k=>groups.get(k)),macros:source.macros.map(r=>[...r]),has:key=>byId.has(key),spec:key=>{const g=byId.get(key);return g?{...g,ids:[...g.ids]}:null;},aliases:key=>[...group(key).ids],read,display:(key,value)=>{const g=group(key);if(!valid(g,value))throw Error('Invalid Master formatter input');return g.displays[value];},normalize,change};
}
