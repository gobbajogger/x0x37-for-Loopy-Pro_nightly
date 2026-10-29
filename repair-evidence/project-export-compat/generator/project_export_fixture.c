/* SPDX-License-Identifier: GPL-3.0-only */
#define main original_stage_test_main
#include "project_stage_test.c"
#undef main
int main(int argc,char **argv) {
 uint8_t header[PROJECT_FILE_HDR];
 if(argc!=2)return 2;
 fixture("synthetic canonical export");
 engine_init(proj.pat,&proj.arr.song,proj.arr.lane,&proj.sound);
 project_reset_stage();
 /* This is synthetic valid content, not an inferred migration of owner sounds. */
 memset(&project_stage.sound,0,sizeof project_stage.sound);
 project_stage.pat[0].bass[0].step[0]=(bstep_t){60,G_NOTE,90};
#ifdef BS_END_SHIFT
 project_stage.pat[0].bass[0].step[0].flags|=5u<<BS_END_SHIFT;
#endif
 int stage=project_validate_stage();project_file_header(header);
 int valid=project_file_validate(header);
 printf("stage=%d file_validate=%d payload=%u header=%u pattern=%u sound=%u product_wobble=%d\n",stage,valid,(unsigned)sizeof project_stage,(unsigned)PROJECT_FILE_HDR,(unsigned)get32(header+20),(unsigned)get32(header+24),engine_bass_is_wobble(0));
 if(stage||valid||!engine_bass_is_wobble(0))return 3;
 FILE *f=fopen(argv[1],"wb");if(!f)return 4;
 fwrite(header,1,sizeof header,f);fwrite(&project_stage,1,sizeof project_stage,f);fclose(f);
 return 0;
}
