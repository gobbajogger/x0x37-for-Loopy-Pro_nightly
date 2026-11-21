// Exact production pref_value_of display table, not runtime admission.
// Firmware PR953 1bd5f6854486b8cb1dadec08cc1c33c01f9f35a0; JSON SHA256 8450ace83796652fdf59058c67b3342082c8a38f37e4e148734e04c97f59ec69
import mixerFormatTable from './mixer-format.json' with {type:'json'};
export {mixerFormatTable};
export function mixerDisplay(id,value){const identity=String(id).split("|").at(-1).split(":").map(Number);if(identity.length!==4||identity[0]!==1||identity[1]!==5||!mixerFormatTable.voices.includes(identity[2])||!Number.isInteger(value)||value<0||value>127)return null;const row=mixerFormatTable.controls.find(c=>c.slot===identity[3])?.values[value];return row&&row.raw===value?row.number+row.unit:null;}

// The FX page uses the same readouts as the firmware's fxbus_param_si and
// pref_value_of. The identity selects the curve even when two labels match.
import fxReadouts from './fx-format.json' with {type:'json'};
export function fxDisplay(id, raw) {
  if (!Number.isInteger(raw) || typeof id !== 'string') return null;
  const identity = id.split('|').at(-1);
  return Object.hasOwn(fxReadouts, identity) ? fxReadouts[identity][raw] ?? null : null;
}
