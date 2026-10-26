import importlib.util,json,sys,subprocess
from pathlib import Path
root=Path('/Users/mac/Documents/Codex/2026-10-26/task-6')
sys.path.insert(0,str(root/'ota-identity-firmware/tools'))
import fm1_install as I
spec=importlib.util.spec_from_file_location('primary_sinco','/Users/mac/Documents/smk37 firmware reverse-engineered/analysis/scripts/sinco_packet.py')
primary=importlib.util.module_from_spec(spec);spec.loader.exec_module(primary)
text='SMK-37 Elite_900'
payload=text.encode().ljust(27,b'\0')
good=primary.sysex_encode(primary.sinco_packet(0x11,payload))
cases=[{'label':'primary desktop checksum/pack encoder','frame':list(good),'expected':text}]
assert I.parse_identity(good).text==text
for i in range(len(good)):
 for bit in range(8):
  frame=bytearray(good);frame[i]^=1<<bit
  label=f'wire byte{i} bit{bit}'
  assert I.parse_identity(frame) is None,label
  cases.append({'label':label,'frame':list(frame),'expected':None})
for bad in ['SMK-37 Elite_', 'SMK-37 Elite_9x0', 'SMK-37 Elite_900x','SMK-37_Elite_900']:
 frame=primary.sysex_encode(primary.sinco_packet(0x11,bad.encode().ljust(27,b'\0')))
 assert I.parse_identity(frame) is None,bad
 cases.append({'label':'invalid model/version syntax '+bad,'frame':list(frame),'expected':None})
frame=primary.sysex_encode(primary.sinco_packet(0x11,b'SMK-37 Elite_901'.ljust(27,b'\0')))
assert I.parse_identity(frame).version==901
cases.append({'label':'correctly checksummed newversion retains valid framing','frame':list(frame),'expected':'SMK-37 Elite_901'})
r=subprocess.run(['node',str(root/'ota-independent-review/cross-parser.mjs'),str(root/'ota-identity-site/web/fm1ota.js'),str(root/'ota-identity-firmware/web/fm1ota.js')],input=json.dumps(cases),text=True,capture_output=True)
print(r.stdout,end='');print(r.stderr,end='');assert r.returncode==0
print(f'PASS actual Python parser {len(cases)} cases generated with primary desktop-analysis encoder; no device capture used')
