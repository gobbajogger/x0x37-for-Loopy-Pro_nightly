// SPDX-License-Identifier: GPL-3.0-only
import {parseSMF,makeImportPlan} from './smf.js';
let parsed=null;
self.onmessage=({data})=>{
  try {
    if(data.op==='parse') {parsed=parseSMF(data.bytes);self.postMessage({id:data.id,ok:true,summary:{format:parsed.format,ppqn:parsed.ppqn,tracks:parsed.tracks.map((x,i)=>({...x,index:i})),events:parsed.events,count:parsed.count,global:parsed.global}});}
    else if(data.op==='preview') {if(!parsed)throw new Error('Choose a MIDI file first.');self.postMessage({id:data.id,ok:true,plan:makeImportPlan(parsed,data.doc,data.revision,data.settings)});}
    else throw new Error('Unknown import operation.');
  }catch(e){self.postMessage({id:data.id,ok:false,error:e.message});}
};
