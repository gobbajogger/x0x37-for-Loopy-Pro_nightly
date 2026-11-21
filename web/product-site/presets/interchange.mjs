// Original-format file editor. No conversion, storage access, or native apply.
import {synthoneTypes} from './schema.mjs';
const encoder=new TextEncoder();const hidden=new WeakMap();
function parse(text){let i=0,count=0;const ws=()=>{while(/[\x20\t\r\n]/.test(text[i]??'x'))i++;};
 function value(depth=0){if(depth>64||++count>300000)throw Error('JSON complexity limit');ws();let start=i,c=text[i],n;
 if(c==='{'||c==='['){i++;let object=c==='{',end=object?'}':']',children=object?new Map():[];ws();if(text[i]!==end)for(;;){let k;if(object){let key=value(depth+1);if(key.type!=='string')throw Error('Object key required');k=key.value;if(children.has(k))throw Error('Duplicate key');ws();if(text[i++]!==':')throw Error('Colon required');}let child=value(depth+1);object?children.set(k,child):children.push(child);ws();if(text[i]===end)break;if(text[i++]!==',')throw Error('Comma required');}i++;n={type:object?'object':'array',children};
 }else if(c==='"'){i++;for(;;){if(i>=text.length)throw Error('Unterminated string');let ch=text[i++];if(ch==='"')break;if(ch==='\\')i++;}n={type:'string',value:JSON.parse(text.slice(start,i))};
 }else{let m=text.slice(i).match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/);if(!m)throw Error('Invalid JSON value');i+=m[0].length;n={type:m[0]==='null'?'null':/^(true|false)$/.test(m[0])?'boolean':'number',raw:m[0]};}
 return {...n,start,end:i};}
 let root=value();ws();if(i!==text.length)throw Error('Trailing JSON data');return root;
}
const get=(n,k)=>n?.type==='object'?n.children.get(k):undefined;
function requireType(n,t){if(n?.type!==t)throw Error('Required '+t);return n;}
function validateS1(p){requireType(p,'object');for(let k of ['uid','name','bank'])requireType(get(p,k),'string');for(let k of ['cutoff','waveform1'])requireType(get(p,k),'number');if(get(p,'parameterValues'))throw Error('Cross-engine structure');for(let [k,n]of p.children){if(!Object.hasOwn(synthoneTypes,k))continue;let t=synthoneTypes[k];if(t.startsWith('[')){requireType(n,'array');let item=t==='[Bool]'?'boolean':'number';if(['seqPatternNote','seqNoteOn','seqOctBoost'].includes(k)&&n.children.length!==16)throw Error('Sequence requires 16 steps');n.children.forEach(v=>{requireType(v,item);if(t==='[Int]'&&!/^-?\d+$/.test(v.raw))throw Error('Integer required');});}else{requireType(n,{String:'string',Bool:'boolean',Int:'number',Double:'number'}[t]);if(t==='Int'&&!/^-?\d+$/.test(n.raw))throw Error('Integer required');}}}
export function inspect(bytes,profile){if(!(bytes instanceof Uint8Array)||bytes.length>8*1024*1024)throw Error('Bounded byte input required');if(!['synthone','superj6'].includes(profile))throw Error('Original source format not verified for this engine');let original=Uint8Array.from(bytes);let text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(original);let root=parse(text),presets,duplicateIdentifiers=false;
 if(profile==='synthone'){presets=root.type==='array'?root.children:[root];if(!presets.length)throw Error('Empty bank is not identifiable');presets.forEach(validateS1);}
 else{requireType(root,'object');for(let k of ['name','uuid'])requireType(get(root,k),'string');requireType(get(root,'midiBankChangeNumber'),'number');requireType(get(root,'canDelete'),'boolean');presets=requireType(get(root,'presets'),'array').children;for(let p of presets){requireType(get(p,'uid'),'string');requireType(get(p,'name'),'string');let seen=new Set();for(let e of requireType(get(p,'parameterValues'),'array').children){let id=requireType(get(e,'identifier'),'string').value;if(!id)throw Error('Empty identifier');if(seen.has(id))duplicateIdentifiers=true;seen.add(id);requireType(get(e,'value'),'number');}}}
 let result=Object.freeze({profile,container:root.type==='array'?'bank':profile==='synthone'?'preset':'bank',count:presets.length,names:Object.freeze(presets.map(p=>get(p,'name').value)),warnings:Object.freeze(profile==='synthone'?['Legacy fmMod, rez and autoPanRate are preserved, not remapped.']:['Observed J6 bank structure; upstream import and native DSP semantics not qualified.',...(duplicateIdentifiers?['Duplicate parameter identifiers are preserved in original record order, not replayed or deduplicated.']:[])]),canApply:false,original:()=>Uint8Array.from(original)});hidden.set(result,{text,presets});return result;
}
export function edit(doc,index,key,value){let state=hidden.get(doc);if(!state||!Number.isInteger(index)||index<0||index>=state.presets.length)throw Error('Invalid document/index');let allowed=doc.profile==='synthone'?['name','author','userText']:['name','infoText'];if(!allowed.includes(key)||typeof value!=='string'||value.length>8192)throw Error('Only verified existing text metadata is editable');let n=requireType(get(state.presets[index],key),'string');let result=encoder.encode(state.text.slice(0,n.start)+JSON.stringify(value)+state.text.slice(n.end));inspect(result,doc.profile);return result;}
export function session(){let preview=null,kept=null;return {preview(bytes,profile){preview=null;preview=inspect(bytes,profile);return preview;},keep(){if(!preview)throw Error('Preview required');kept=preview.original();preview=null;return Uint8Array.from(kept);},cancel(){preview=null;},kept(){return kept&&Uint8Array.from(kept);}};}

// UTF-16 offsets refer to the original decoded JSON. Numeric file editors use
// these spans so an edit leaves every other token, including unknown data, intact.
export function synthOneNumericTokens(doc, index, keys) {
  const state = hidden.get(doc);
  if (doc?.profile !== 'synthone' || !state || !Number.isInteger(index) || !state.presets[index]) {
    throw new RangeError('Unknown Synth One preset');
  }
  const fields = {};
  for (const key of keys) {
    const node = get(state.presets[index], key);
    if (!node || node.type !== 'number') continue;
    const value = Number(node.raw);
    if (!Number.isFinite(value)) throw new RangeError('Non-finite Synth One value: ' + key);
    fields[key] = {value, start:node.start, end:node.end};
  }
  return fields;
}

// Replace existing numeric values in record order, preserving every other token.
export function superJ6NumericCopy(doc, changes) {
  const state = hidden.get(doc);
  if (doc?.profile !== 'superj6' || !state || !(changes instanceof Map)) throw Error('Expected original SuperJ6 bank');
  if (!changes.size) return doc.original();
  const pieces = [];
  let end = 0, matched = 0;
  for (const [index, preset] of state.presets.entries()) {
    const edits = changes.get(index);
    if (!edits) continue;
    if (!(edits instanceof Map) || !edits.size) throw Error('Expected SuperJ6 parameter edits');
    const seen = new Set();
    for (const item of get(preset, 'parameterValues').children) {
      const key = get(item, 'identifier').value;
      if (!edits.has(key)) continue;
      const value = edits.get(key);
      if (seen.has(key) || !Number.isFinite(value)) throw Error('Ambiguous or invalid SuperJ6 parameter edit');
      const token = get(item, 'value');
      pieces.push(state.text.slice(end, token.start), JSON.stringify(value));
      end = token.end;
      seen.add(key);
    }
    if (seen.size !== edits.size) throw Error('Missing SuperJ6 parameter');
    matched++;
  }
  if (matched !== changes.size) throw Error('Missing SuperJ6 program');
  pieces.push(state.text.slice(end));
  return encoder.encode(pieces.join(''));
}
