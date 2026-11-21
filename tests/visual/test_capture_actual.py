"""Exercise actual screenshot comparison without starting a browser."""
import ast, io, os, re, stat, uuid, tempfile, unittest
from contextlib import redirect_stdout
from pathlib import Path
import numpy as np
from PIL import Image

SOURCE=Path(__file__).with_name('visual_gate.py')

def png(color):
    out=io.BytesIO();Image.new('RGB',(16,16),color).save(out,format='PNG');return out.getvalue()

def load(root, update=False):
    nodes=[n for n in ast.parse(SOURCE.read_text()).body if isinstance(n,ast.FunctionDef) and n.name in ('compare','exit_status','validate_capture_output','write_actual_output','ssim')]
    ns=dict(os=os,re=re,stat=stat,uuid=uuid,io=io,Path=Path,SNAP=root/'baselines',OUT=root/'out',UPDATE=update,ONLY=None,np=np,Image=Image,MAX_DIFF_RATIO=.001,PIXEL_THRESHOLD=25.5)
    exec(compile(ast.Module(body=nodes,type_ignores=[]),str(SOURCE),'exec'),ns)
    return ns

class Capture(unittest.TestCase):
    def capture_header(self, ns, actual, reference, results):
        # Execute the real 1024 header branch. Only the browser's PNG producer is
        # replaced; comparison, output safety and subsequent NOBASE cleanup run.
        tree=ast.parse(SOURCE.read_text())
        main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
        branch=next(n for n in ast.walk(main) if isinstance(n,ast.If)
            and isinstance(n.test,ast.Compare)
            and isinstance(n.test.left,ast.Tuple)
            and [getattr(e,'id',None) for e in n.test.left.elts]==['w','h'])
        body=compile(ast.Module(body=branch.body,type_ignores=[]),str(SOURCE),'exec')
        class Screenshot:
            def screenshot(self,*,clip):
                if clip!={'x':0,'y':0,'width':1024,'height':148}:
                    raise AssertionError(f'unexpected header clip: {clip}')
                return actual
        ns.update(pg=Screenshot(),FIX=reference,results=results)
        with redirect_stdout(io.StringIO()):exec(body,ns)

    def test_failed_header_capture_survives_missing_page_baseline_cleanup(self):
        data=io.BytesIO();Image.new('RGB',(1024,148),'white').save(data,format='PNG')
        actual=data.getvalue()
        with tempfile.TemporaryDirectory() as d:
            ns=load(Path(d));reference=Path(d)/'page-01.png'
            Image.new('RGB',(2880,1800),'black').save(reference)
            original=reference.read_bytes();results=[]
            self.capture_header(ns,actual,reference,results)
            with redirect_stdout(io.StringIO()):
                ns['compare']('remote-sequence-1024x640',actual,results)
            self.assertEqual(results[0][:2],('header-ssim-1024x640','FAIL'))
            self.assertEqual(results[1],('remote-sequence-1024x640','NOBASE',0.0))
            retained=ns['OUT']/'header-ssim-1024x640-actual.png'
            self.assertTrue(retained.exists(),'failed header pixels were discarded')
            self.assertEqual(retained.read_bytes(),actual)
            self.assertFalse((ns['OUT']/'remote-sequence-1024x640-actual.png').exists())
            self.assertFalse(ns['SNAP'].exists())
            self.assertEqual(reference.read_bytes(),original)
            self.assertEqual(ns['exit_status'](results,[],[]),1)

    def test_matching_header_creates_no_failure_capture(self):
        data=io.BytesIO();Image.new('RGB',(1024,148),'black').save(data,format='PNG')
        actual=data.getvalue()
        with tempfile.TemporaryDirectory() as d:
            ns=load(Path(d));reference=Path(d)/'page-01.png'
            Image.new('RGB',(2880,1800),'black').save(reference)
            original=reference.read_bytes();results=[]
            self.capture_header(ns,actual,reference,results)
            ns['compare']('remote-sequence-1024x640',actual,results)
            self.assertEqual(results[0],('header-ssim-1024x640','PASS',1.0))
            self.assertFalse((ns['OUT']/'header-ssim-1024x640-actual.png').exists())
            self.assertFalse(ns['SNAP'].exists())
            self.assertEqual(reference.read_bytes(),original)
            self.assertEqual(ns['exit_status'](results,[],[]),0)

    def test_missing_baseline_cleans_actual_without_creating_reference_directory(self):
        with tempfile.TemporaryDirectory() as d:
            ns=load(Path(d));results=[];data=png('red');ns['compare']('screen',data,results)
            self.assertEqual(results,[('screen','NOBASE',0.0)])
            self.assertFalse((ns['OUT']/'screen-actual.png').exists())
            self.assertFalse(ns['SNAP'].exists())
            self.assertEqual(ns['exit_status'](results,[],[]),0) # preserve current NOBASE policy

    def test_failure_keeps_actual_pass_cleans_it_and_neither_changes_reference(self):
        for color,status in [('red','PASS'),('blue','FAIL')]:
            with self.subTest(status=status),tempfile.TemporaryDirectory() as d:
                ns=load(Path(d));ns['SNAP'].mkdir();reference=png('red');(ns['SNAP']/'screen.png').write_bytes(reference)
                actual=png(color);results=[];ns['compare']('screen',actual,results)
                self.assertEqual(results[0][1],status)
                if status == 'FAIL':
                    self.assertEqual((ns['OUT']/'screen-actual.png').read_bytes(),actual)
                else:
                    self.assertFalse((ns['OUT']/'screen-actual.png').exists())
                self.assertEqual((ns['SNAP']/'screen.png').read_bytes(),reference)
                self.assertEqual(ns['exit_status'](results,[],[]),int(status=='FAIL'))

    def test_explicit_update_preserves_supported_baseline_workflow(self):
        with tempfile.TemporaryDirectory() as d:
            ns=load(Path(d),update=True)
            data=png('red');results=[];ns['compare']('screen',data,results)
            self.assertEqual(results,[('screen','BASELINE',0.0)])
            self.assertEqual((ns['SNAP']/'screen.png').read_bytes(),data)
            self.assertEqual(ns['exit_status'](results,[],[]),1)

    def test_capture_rejects_output_inside_baselines(self):
        with tempfile.TemporaryDirectory() as d:
            ns=load(Path(d));ns['OUT']=ns['SNAP']/'captures'
            with self.assertRaises(ValueError):ns['compare']('screen',png('red'),[])
            self.assertFalse(ns['SNAP'].exists())

    def test_normal_pass_cleanup_and_failure_signals_unchanged(self):
        with tempfile.TemporaryDirectory() as d:
            ns=load(Path(d));ns['SNAP'].mkdir();data=png('red');(ns['SNAP']/'screen.png').write_bytes(data)
            results=[];ns['compare']('screen',data,results)
            self.assertFalse((ns['OUT']/'screen-actual.png').exists())
            self.assertEqual(ns['exit_status'](results,['overflow'],[]),1)
            self.assertEqual(ns['exit_status'](results,[],['page error']),1)
            ns['ONLY']='screen';self.assertEqual(ns['exit_status'](results,[],[]),1)

    def test_output_links_never_overwrite_baselines(self):
        for suffix,hardlink in [('-actual.png',False),('-diff.png',False),('-actual.png',True)]:
            with self.subTest(suffix=suffix,hardlink=hardlink), tempfile.TemporaryDirectory() as d:
                ns=load(Path(d));ns['SNAP'].mkdir();ns['OUT'].mkdir();reference=png('red');base=ns['SNAP']/'screen.png';base.write_bytes(reference)
                target=ns['OUT']/('screen'+suffix)
                if hardlink: os.link(base,target)
                else: target.symlink_to(base)
                with self.assertRaises(ValueError):ns['compare']('screen',png('blue'),[])
                self.assertEqual(base.read_bytes(),reference)

    def test_capture_name_cannot_escape_output(self):
        for name in ['../screen','nested/screen','/absolute','..']:
            with self.subTest(name=name),tempfile.TemporaryDirectory() as d:
                ns=load(Path(d))
                with self.assertRaises(ValueError):ns['compare'](name,png('red'),[])
                self.assertFalse((Path(d)/'screen-actual.png').exists())

    def test_output_directory_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            ns=load(Path(d));other=Path(d)/'other';other.mkdir();ns['OUT'].symlink_to(other,target_is_directory=True)
            with self.assertRaises(ValueError):ns['compare']('screen',png('red'),[])
            self.assertEqual(list(other.iterdir()),[])

    def test_summary_link_rejected_and_regular_output_can_be_replaced(self):
        with tempfile.TemporaryDirectory() as d:
            ns=load(Path(d));ns['OUT'].mkdir();base=Path(d)/'reference.png';data=png('red');base.write_bytes(data)
            (ns['OUT']/'summary.json').symlink_to(base)
            with self.assertRaises(ValueError):ns['write_actual_output']('summary.json',b'{}')
            self.assertEqual(base.read_bytes(),data)
            ns['write_actual_output']('screen-actual.png',b'first')
            ns['write_actual_output']('screen-actual.png',b'second')
            self.assertEqual((ns['OUT']/'screen-actual.png').read_bytes(),b'second')
            self.assertEqual(list(ns['OUT'].glob('.capture-*')),[])

if __name__=='__main__':unittest.main()
