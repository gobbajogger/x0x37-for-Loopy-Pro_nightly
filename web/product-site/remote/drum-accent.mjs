// SPDX-License-Identifier: GPL-3.0-only
// Stock pattern.h stores one dpart_t.accent bit per kit and step.
// A trace of note velocities does not identify those bits.
export const drumAccent = Object.freeze({
 label: 'Accent',
 domain: Object.freeze([false, true]),
 text: value => value == null ? 'Not set' : value ? 'On' : 'Off'
});

// The Sound panel edits the kit's scalar (voice 11, parameter 1). Every
// voice screen carries a distinct historical Draft key for that same address.
// The captured 909 UI calls p1 ACCENT but its engine names p1 Veloc; the
// separate 909 accent-gain target is p0. Keep old p1 edits on their real target.
export function kitAccentAliases(components) {
 const byId=new Map(), kits=new Map();
 for(const screen of components.screens){
  const voice=screen.successor?.sourceVoice;
  if(!voice)continue;
  const address='1:'+voice.kit+':11:1';
  const control=screen.controls.find(c=>c.identity===address);
  if(!control)continue;
  let kit=kits.get(address);
  if(!kit){
   kit={label:voice.kit===0?'909 / KIT':'808 / KIT',name:voice.kit===0?'Velocity':'Accent',voices:new Map()};
   kits.set(address,kit);
  }
  const id=screen.path+'|'+address;
  kit.voices.set(id,voice.nativeName);
  byId.set(id,kit);
 }
 return byId;
}

// An old Draft may have a different explicit value on two voice pages.
// Preserve both until the musician edits the kit, including an Undo of that edit.
export function sharedKitAccent(kit, edits) {
 const values=new Set();
 for(const id of kit.voices.keys())if(edits.has(id))values.add(edits.get(id));
 return values.size===1?values.values().next().value:undefined;
}
