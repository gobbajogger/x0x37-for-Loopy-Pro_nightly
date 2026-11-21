"""Extract and execute the public firmware tuning-fork renderer. No engine or binary SDK is required."""
import hashlib
import subprocess
import sys
import tempfile
from pathlib import Path

COMMIT = '9dd6f2df020340f7a82ab241ef07c6ec16195ebc'
SOURCE = 'firmware/src/app/ui_drum_voice.inc'
DIGEST = '9fed48b3c5546014970ba7360f6b8ebb0ebca11a45dd7b379c0e7fd040256894'
HEADER = '''#include <stdio.h>
#include <stdint.h>
#define UI_DRAW
static void cv_poly_aa(float *xy,int n,uint16_t col){
 (void)col;
 for(int i=0;i<n;i++)printf(" %.8f %.8f",xy[2*i],xy[2*i+1]);
}
'''
MAIN = '''int main(void){
 for(int raw=0;raw<=127;raw++){
  printf("%d",raw);
  dv_tune_fork(0,0,1,1,(float)raw/127.f,0);
  putchar(10);
 }
}
'''

def main():
    source = Path(sys.argv[1])
    data = source.read_bytes() if source.is_file() else subprocess.check_output(
        ['git','-C',str(source),'show',COMMIT+':'+SOURCE])
    assert hashlib.sha256(data).hexdigest() == DIGEST
    text = data.decode()
    first = text.index('static UI_DRAW void dv_tune_fork(')
    end = text.index('/* One projection for the small kick', first)
    with tempfile.TemporaryDirectory() as work:
        c = Path(work)/'fork.c'
        binary = Path(work)/'fork'
        c.write_text(HEADER+text[first:end]+MAIN)
        subprocess.run(['cc','-std=c11','-O2','-Wall','-Werror',str(c),'-o',str(binary)],check=True)
        Path(sys.argv[2]).write_bytes(subprocess.check_output([binary]))

if __name__=='__main__':
    main()
