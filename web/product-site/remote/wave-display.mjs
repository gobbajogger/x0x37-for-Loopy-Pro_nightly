// SPDX-License-Identifier: GPL-3.0-only
// Chicago source waveform is a continuous SAW→square projection (not a fakeenum).
export function waveDisplay(bank,raw,max=127){if(bank!=='CHICAGO'||!Number.isFinite(raw)||!Number.isFinite(max)||max<=0||raw<0||raw>max)return null;if(raw===0)return'SAW';if(raw===max)return'SQR';return'BLEND';}
export function parseWaveDisplay(bank,text,max=127){if(bank!=='CHICAGO')return null;const t=String(text).trim().toUpperCase();if(t==='SAW')return 0;if(t==='SQR'||t==='SQUARE')return max;const m=/^BLEND\s+(\d{1,3})\s*%$/.exec(t);return m&&Number(m[1])<=100?Math.round(Number(m[1])*max/100):null;}

// Native 29×19 cue in ffd31a73 ui_original_wave.h; names from ui.c.
// The C oracle checks all 30 factories, both bass slots and every q127 position.
const triangle = {name:'TRI', zero:9, rows:[17,16,15,14,12,11,10,9,8,7,6,4,3,2,1,2,3,4,6,7,8,9,10,11,12,14,15,16,17]};
const saw = {name:'SAW', zero:9, rows:[9,10,10,11,11,12,12,13,14,14,15,15,16,16,9,2,2,3,3,4,4,5,6,6,7,7,8,8,9]};
const square = {name:'SQR', zero:9, rows:[9,17,17,17,17,17,17,17,17,17,17,17,17,17,9,1,1,1,1,1,1,1,1,1,1,1,1,1,9]};
const pulse = {name:'PUL', zero:15, rows:[17,17,17,17,17,17,17,17,17,17,17,17,17,17,9,1,1,17,17,17,17,17,17,17,17,17,17,17,17]};
const down = {name:'DOWN', zero:9, rows:[1,2,2,3,3,4,4,5,6,6,7,7,8,8,9,10,10,11,11,12,12,13,14,14,15,15,16,16,17]};
const up = {name:'UP', zero:9, rows:[17,16,16,15,15,14,14,13,12,12,11,11,10,10,9,8,8,7,7,6,6,5,4,4,3,3,2,2,1]};
const wobbleSquare = {name:'SQR', zero:9, rows:[1,1,1,1,1,1,1,1,1,1,1,1,1,1,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17]};

const selectors = new Map([
 [0, [triangle, saw, square]],
 [6, [triangle, saw, square, pulse]],
 [11, [triangle, down, up, wobbleSquare]]
]);

export function miamiWaveParameter(row) {
 return row?.kind === 1 && row.target === 2 && row.sourceBank === 1 &&
        (row.voice === 0 || row.voice === 1) && selectors.has(row.parameter)
        ? row.parameter : null;
}

export function miamiWave(parameter, raw) {
 const states = selectors.get(parameter);
 if (!states || !Number.isInteger(raw) || raw < 0 || raw > 127) return null;
 return states[Math.round(raw * (states.length - 1) / 127)];
}
