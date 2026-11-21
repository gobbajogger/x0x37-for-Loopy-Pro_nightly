// SPDX-License-Identifier: GPL-3.0-only
class El{
 constructor(tag){this.tag=tag;this.dataset={};this.children=[];this.listeners={};this.textContent='';this.value='';this.disabled=false;this._id='';}
 get id(){return this._id;}
 set id(value){this._id=value;this.owner.nodes.set(value,this);}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 append(child){child.owner=this.owner;if(child._id)this.owner.nodes.set(child._id,child);this.children.push(child);}
 replaceChildren(){this.children.length=0;}
 click(){return Promise.all((this.listeners.click??[]).map(fn=>fn({preventDefault(){}})));}
 fire(type){for(const fn of this.listeners[type]??[])fn();}
}
export function dom(){
 const nodes=new Map();
 const document={defaultView:new EventTarget(),createElement(tag){const el=new El(tag);el.owner={nodes};return el;},getElementById(id){return nodes.get(id)??null;}};
 for(const id of ['connect','apply','conn-state','firmware-safety','firmware-controls']){const el=new El('node');el.owner={nodes};el.id=id;el.textContent=id==='connect'?'Connect':'';}
 return {document,nodes};
}
