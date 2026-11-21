"""Extract the original 909 kick P.Dpth's idle slot points for a grid of all three knobs."""
import hashlib
import itertools
import json
import runpy
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

nightly,firmware,out=map(Path,sys.argv[1:])
remote=nightly/'web/product-site/remote'
source=(firmware/'firmware/src/app/ui_drum_voice.inc').read_text()
screen=next(s for s in json.loads((remote/'components.json').read_bytes())['screens'] if s['path'].endswith('/909-voice-00.svg'))
donor=ET.fromstring(screen['body_svg']).find(".//*[@data-source-control='1:0:0:4']//*[@data-glyph-semantic='P.DPTH']")
assert donor is not None and len(donor)==1 and donor[0].get('d')=='M0 2H7Q13 12 19 12H31'
ui=(firmware/'firmware/src/app/ui.c').read_text()
assert 'if(k9 && r.b==0 /* BD */ && (name_is(d,"Tune")||name_is(d,"P.Dpth")||name_is(d,"Pitch"))) return DG_BDSWEEP;' in ui
engine=(firmware/'firmware/src/app/engine.c').read_text()
assert 'return drum909_bd_hz(tau, m, pm, t_ms);' in engine
common=runpy.run_path(str(Path(__file__).parent.parent/'drum-decay/source-oracle.py'))
pin=json.loads((nightly/'tools/drum-source/identity.json').read_bytes())
for name,sha in {**pin['inputs'],**common['RENDERER_INPUTS']}.items():
    b=(firmware/name).read_bytes()
    assert hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()==sha,name
section=source[source.index('    if (role == DG_BDSWEEP)'):source.index('    if (role == DG_LPF)')]
pre=section[section.index('        int c0 ='):section.index('        if (r.c == c0)')]
# The C emitter's Tune branch is a raster. P.Dpth (c4) continues to this polyline.
curve=section[section.index('        n = 0;\n        for (i = 0; i <= 24; i++)'):section.index('        cv_poly_aa(xy, n, col);')]
quantization=next(line.strip() for line in source.splitlines() if 'int val = (int)(ev +' in line)
level=source[source.index('static UI_DRAW float dv_sweep_level('):source.index('/* Scale of the selected single-control')].replace('UI_DRAW ','')
prefix=r'''
#include <assert.h>
#include <stdio.h>
#include "drum909.h"
#include "fastmath.h"
typedef struct{int a,b,c;} pref_t;
#define R_ENG 1
#define T_909 0
#define PR(kind,a,b,c) ((pref_t){a,b,c})
static int pots[6];
static int matrix_value(pref_t r){return pots[r.c];}
static float dg_si(pref_t r,int c,int pot){float x=0;(void)drum909_param_si(r.b,c,pot,&x);return x;}
#define engine_bd909_hz drum909_bd_hz
'''
main=r'''
int main(void) {
    pref_t r={0,0,4};
    float ev;
    while(scanf("%d%f%d",&pots[0],&ev,&pots[5])==3){
        float xy[50],ox=0,oy=0,sx=1,sy=1;int n,i;
'''
end=r'''
        assert(n==25);
        printf("%d %.9g %d",pots[0],(double)ev,pots[5]);
        for(i=0;i<50;i++)printf(" %.9g",(double)xy[i]);
        putchar('\n');
    }
    return 0;
}
'''
with tempfile.TemporaryDirectory() as tmp:
    work=Path(tmp);dsp=firmware/'firmware/src/dsp'
    subprocess.run([sys.executable,str(firmware/'tools/gen_drum_samples.py'),str(work/'x0x_drum_samples.h')],check=True,stdout=subprocess.DEVNULL)
    probe=work/'sweep.c';probe.write_text(prefix+level+main+quantization+pre+curve+end)
    binary=work/'sweep'
    subprocess.run(['cc','-std=c11','-O2','-DX0X_HOST','-ffp-contract=off','-ffunction-sections','-fdata-sections',f'-I{dsp}',f'-I{work}',str(probe),str(dsp/'drum909.c'),str(dsp/'x0x_param.c'),'-Wl,--gc-sections','-o',str(binary)],check=True)
    settings=set()
    for axis in range(3):
        # Every setting of every knob, with the other two at either endpoint
        # or their independent recorded factory values.
        bases=[(0,34,127),(0,64,127),(0,45,127)];bases[axis]=range(128)
        settings.update(itertools.product(*bases))
    # The Remote's first two 60 Hz ease frames from raw 0 to 127,
    # supplied as native float input to the production rounding expression.
    for tune,pitch in [(0,0),(34,45),(34,127),(127,45),(127,127)]:
        settings.update((tune,ev,pitch) for ev in (8.391623497009277,25.811050415039062))
    rows=''.join('%d %.12g %d\n'%s for s in sorted(settings))
    out.write_bytes(subprocess.check_output([binary],input=rows.encode()))
