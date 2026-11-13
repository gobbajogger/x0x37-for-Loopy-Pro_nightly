import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const page=readFileSync(new URL('../web/x0x_breaks.html',import.meta.url),'utf8');
test('sample page uses DnBOX and SMK-37 user-facing names',()=>{
 for(const text of ["<title>DnBOX break loops</title>","href=\"../\">DnBOX</a>","with DnBOX running.","says how DnBOX plays a loop.","The SMK-37 stopped answering.","No SMK-37 running DnBOX found.","This firmware can't send its loops back to the page. Update DnBOX, then connect again.","The SMK-37 couldn't clear its memory.","The SMK-37 couldn't erase its memory.","Writing to the SMK-37 failed.","The SMK-37 didn't accept the loops.","Done. On the SMK-37: BREAK, then EDIT, then LOOP A or LOOP B.","DnBOX builds on X0X and Felucca by Hügelton Instruments (GPL-3.0);"]) assert.ok(page.includes(text),text);
 for(const text of ["<title>X0X break loops</title>","href=\"../\">X0X</a>","with X0X running.","says how X0X plays a loop.","The FM-1 stopped answering.","No FM-1 running X0X found.","This X0X can't send its loops back to the page. Update X0X, then connect again.","The FM-1 couldn't clear its memory.","The FM-1 couldn't erase its memory.","Writing to the FM-1 failed.","The FM-1 didn't accept the loops.","Done. On the FM-1: BREAK, then EDIT, then LOOP A or LOOP B.","`x0x-slots-${stamp","X0X is GPL-3.0, built on Felucca by Hügelton Instruments;"]) assert.ok(!page.includes(text),text);
});
test('backup basename is DnBOX while archive extension and upstream credit remain',()=>{
 assert.ok(page.includes('`DnBOX-slots-${stamp'));
 assert.ok(page.includes('}.x0xslots`'));
 assert.ok(page.includes('X0X and Felucca by Hügelton Instruments'));
});
