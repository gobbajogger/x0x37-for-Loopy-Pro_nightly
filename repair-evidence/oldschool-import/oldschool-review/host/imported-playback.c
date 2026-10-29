#define main original_breaks_test_main
#include "/Users/mac/Documents/Codex/2026-10-26/task-6/project-compat-rebind/current/tests/host/breaks_test.c"
#undef main
X0X_COLD static uint8_t loop_bars(uint32_t ns, uint32_t rate)
{
    float sec = (float)ns / (float)(rate ? rate : 22050u), best = 1e9f;
    uint8_t bars = 1, b;
    for (b = 1; b <= 8; b = (uint8_t)(b * 2)) {
        float bpm = (float)b * 240.0f / sec, d = bpm > 120.0f ? bpm - 120.0f : 120.0f - bpm;
        if (bpm >= 80.0f && bpm <= 180.0f && d < best) {
            best = d;
            bars = b;
        }
    }
    return bars;
}


static uint32_t word(const uint8_t *p){return(uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
int main(int argc,char **argv){
 if(argc!=3)return 9;
 for(int v=0;v<2;v++){
  uint8_t h[512];FILE *f=fopen(argv[v+1],"rb");if(!f)return 8;
  if(fread(h,1,512,f)!=512)return 7;
  uint32_t n=word(h+36),rateq=word(h+48),rate=(rateq>>16)*44100u+(((rateq&65535u)*44100u+32768u)>>16);
  if(n!=LOOP_N||rate!=SRC_FS||word(h+16)!=(n+1)/2||word(h)!=0x504d5346||h[6]!=1)return 6;
  if(fread(g_adpcm[v],1,(n+1)/2,f)!=(n+1)/2||fgetc(f)!=EOF)return 5;fclose(f);
  g_loop[v]=(brk_loop_t){g_adpcm[v],n,rate,loop_bars(n,rate)};
  if(g_loop[v].bars!=2)return 4;
 }
 int32_t pred=0,index=0;for(int i=0;i<LOOP_N;i++)g_dec[i]=(int16_t)ima_decode(g_adpcm[0],(uint32_t)i,&pred,&index);
 printf("actual importer slot %d samples at stored %d Hz, engine bars=%u\n",LOOP_N,SRC_FS,(unsigned)g_loop[0].bars);
 test_audio(90.0f);test_audio(120.0f);test_audio(170.0f);test_gate();test_live();
 printf("%d passed, %d failed\n",g_pass,g_fail);return g_fail?1:0;
}
