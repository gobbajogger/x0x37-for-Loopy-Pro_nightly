import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readArchive, parseHeader } from '../../../web/x0x_breaks.js';
const python = String.raw`
import importlib.util, struct, sys, zlib, os
p=os.environ['X0X_SLOTS_PY']
spec=importlib.util.spec_from_file_location('review_slots',p)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def image(name, data):
 h=bytearray([255]*512)
 struct.pack_into('<IHBB8sII',h,0,0x504D5346,1,1,0,name, len(data),zlib.crc32(data))
 struct.pack_into('<5I',h,32,0,5,0,5,32768)
 struct.pack_into('<hBB',h,56,0,0,0)
 return bytes(h)+data
lay={'count':3,'size':81920,'slots':[{'size':81920},{'size':122880},{'size':45056}]}
sys.stdout.buffer.write(m.make_archive(lay,[image(b'PYONE\0\0\0',b'\x12\x34\x50'),None,image(b'PYTWO\0\0\0',b'\x65\x43\x20')],'2026-10-26T00:00:00Z'))
`;
const archive = execFileSync('python3',['-B','-c',python]);
const {images,meta}=readArchive(archive);
assert.deepEqual(images.map(x=>x&&parseHeader(x).name),['PYONE',null,'PYTWO']);
assert.deepEqual([...images[0].subarray(512)],[0x12,0x34,0x50]);
assert.deepEqual([...images[2].subarray(512)],[0x65,0x43,0x20]);
assert.equal(meta.slots[0].rates[0],22050);
console.log('PASS actual Python make_archive -> browser readArchive; two populated slots with interspersed empty, n=5 odd ADPCM samples, 22050Hz, variable original slot sizes');
