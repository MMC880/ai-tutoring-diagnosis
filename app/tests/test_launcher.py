import importlib.util,sys,unittest,tempfile,json,os,socket,subprocess,signal,threading,shutil
from http.server import BaseHTTPRequestHandler,HTTPServer
from unittest.mock import patch,MagicMock
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
try:import launcher
except ImportError:launcher=None

class LauncherTests(unittest.TestCase):
 def setUp(self):self.assertIsNotNone(launcher,'尚无教师启动预检')
 def test_dependencies_are_imported_and_reported_without_key(self):
  r=launcher.dependencies();self.assertTrue(r['ok']);self.assertIn('python-docx',r['packages']);self.assertNotIn('api_key',str(r))
 def test_service_identity_requires_matching_project_and_data(self):
  h=dict(status='ok',mode='LOCAL_STORE_EXPLICIT_AI',version='0.16.0');i=dict(application_directory=str(ROOT),data_directory=str(ROOT/'.local-data'))
  self.assertEqual(launcher.identify(h,i,ROOT,ROOT/'.local-data'),'OWN')
  self.assertEqual(launcher.identify(h,i|dict(application_directory='E:/other'),ROOT,ROOT/'.local-data'),'CONFLICT')
  self.assertEqual(launcher.identify(h,i|dict(data_directory='E:/other'),ROOT,ROOT/'.local-data'),'CONFLICT')
 def test_health_alone_and_arbitrary_service_are_not_reused(self):
  self.assertEqual(launcher.identify({},None,ROOT,ROOT/'.local-data'),'CONFLICT')
  self.assertEqual(launcher.identify(dict(mode='LOCAL_STORE_EXPLICIT_AI'),None,ROOT,ROOT/'.local-data'),'CONFLICT')
 def test_ports_are_positive_integers(self):
  for v in [True,0,-1,65536,'8765']:
   with self.subTest(value=v):
    with self.assertRaises(ValueError):launcher.valid_port(v)
 def test_preflight_free_does_not_create_data_or_start(self):
  folder=ROOT/'.qa-temp';folder.mkdir(exist_ok=True)
  with tempfile.TemporaryDirectory(dir=folder) as tmp:
   path=Path(tmp)/'尚不存在 学生库'
   r=launcher.preflight(ROOT,path,8765,probe=lambda *a:dict(state='FREE'))
   self.assertTrue(r['dependencies']['ok']);self.assertEqual(r['service']['state'],'FREE');self.assertFalse(path.exists())
 def test_conflicting_listener_is_reported_not_started(self):
  r=launcher.preflight(ROOT,ROOT/'.local-data',8765,probe=lambda *a:dict(state='CONFLICT'))
  self.assertEqual(r['service']['state'],'CONFLICT');self.assertFalse(r['ready_to_start'])
 def test_service_changed_after_readiness_does_not_open_browser(self):
  (ROOT/'.qa-temp').mkdir(exist_ok=True)
  with tempfile.TemporaryDirectory(dir=ROOT/'.qa-temp') as tmp:
   child=MagicMock();child.pid=12345
   with patch.object(launcher,'preflight',return_value=dict(ready_to_start=True,service=dict(state='FREE'),url='http://127.0.0.1:9999')),patch.object(launcher.subprocess,'Popen',return_value=child),patch.object(launcher,'probe_service',side_effect=[dict(state='OWN'),dict(state='CONFLICT')]),patch.object(launcher.webbrowser,'open') as browser:
    with self.assertRaises(RuntimeError):launcher.launch(ROOT,Path(tmp),9999)
    browser.assert_not_called()
 def test_unavailable_browser_is_explicit_and_url_is_retained(self):
  with patch.object(launcher,'preflight',return_value=dict(ready_to_start=True,service=dict(state='OWN'),url='http://127.0.0.1:9999')),patch.object(launcher.webbrowser,'open',return_value=False):
   result=launcher.launch(ROOT,ROOT/'.local-data',9999)
   self.assertIs(result.get('browser_opened'),False);self.assertIn('手动',result.get('message',''));self.assertEqual(result['url'],'http://127.0.0.1:9999')

class LauncherIntegrationTests(unittest.TestCase):
 def setUp(self):
  (ROOT/'.qa-temp').mkdir(exist_ok=True)
  self.temp=tempfile.TemporaryDirectory(dir=ROOT/'.qa-temp');self.data=Path(self.temp.name)/'中文 空格资料'
  with socket.socket() as sock:sock.bind(('127.0.0.1',0));self.port=sock.getsockname()[1]
  self.pid=None
 def tearDown(self):
  if self.pid:
   # This test only stops its own newly-created child, after verifying its identity.
   self.assertEqual(launcher.probe_service(ROOT,self.data,self.port)['state'],'OWN')
   os.kill(self.pid,signal.SIGTERM)
   import time
   for _ in range(80):
    if launcher.probe_service(ROOT,self.data,self.port)['state']=='FREE':break
    time.sleep(.05)
  self.temp.cleanup()
 def test_cli_check_is_read_only_for_missing_chinese_space_path(self):
  result=subprocess.run([sys.executable,str(ROOT/'launcher.py'),'--check','--port',str(self.port),'--data-dir',str(self.data)],capture_output=True,encoding='utf-8',env=os.environ|{'PYTHONIOENCODING':'utf-8'})
  self.assertEqual(result.returncode,0,result.stderr+result.stdout);self.assertEqual(json.loads(result.stdout)['service']['state'],'FREE');self.assertFalse(self.data.exists())
 def test_real_child_readiness_identity_and_duplicate_launch_reuse(self):
  first=launcher.launch(ROOT,self.data,self.port,no_browser=True);self.pid=first['pid']
  self.assertFalse(first['reused']);self.assertEqual(launcher.probe_service(ROOT,self.data,self.port)['state'],'OWN')
  self.assertEqual(launcher.probe_service(ROOT,self.data/'other',self.port)['state'],'CONFLICT')
  second=launcher.launch(ROOT,self.data,self.port,no_browser=True)
  self.assertTrue(second['reused']);self.assertNotIn('pid',second)
 def test_foreign_http_service_refused_without_creating_data(self):
  class Foreign(BaseHTTPRequestHandler):
   def do_GET(self):
    self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"status":"ok"}')
   def log_message(self,*args):pass
  server=HTTPServer(('127.0.0.1',self.port),Foreign);worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
  try:
   self.assertEqual(launcher.probe_service(ROOT,self.data,self.port)['state'],'CONFLICT')
   with self.assertRaises(RuntimeError):launcher.launch(ROOT,self.data,self.port,True)
   self.assertFalse(self.data.exists())
  finally:server.shutdown();worker.join();server.server_close()
 @unittest.skipUnless(sys.platform=='win32','Windows CMD entry')
 def test_cmd_check_reads_existing_runtime_and_leaves_no_data(self):
  result=subprocess.run(['cmd.exe','/d','/c',str(ROOT/'启动.cmd'),'--check','--no-browser','--port',str(self.port),'--data-dir',str(self.data)],capture_output=True,encoding='utf-8',errors='replace',env=os.environ|{'JINXUE_PYTHON':sys.executable})
  self.assertEqual(result.returncode,0,result.stderr+result.stdout);self.assertEqual(json.loads(result.stdout)['service']['state'],'FREE');self.assertFalse(self.data.exists())
 @unittest.skipUnless(sys.platform=='win32','Windows CMD entry')
 def test_explicit_missing_runtime_is_not_silently_replaced(self):
  result=subprocess.run(['cmd.exe','/d','/c',str(ROOT/'启动.cmd'),'--check','--data-dir',str(self.data)],capture_output=True,encoding='utf-8',errors='replace',env=os.environ|{'JINXUE_PYTHON':str(Path(self.temp.name)/'不存在.exe')})
  self.assertEqual(result.returncode,1);self.assertFalse(self.data.exists())
 @unittest.skipUnless(sys.platform=='win32','Windows CMD entry')
 def test_cmd_from_chinese_space_application_directory(self):
  app=Path(self.temp.name)/'中文 空格程序';app.mkdir()
  for name in ('启动.cmd','launcher.py'):shutil.copyfile(ROOT/name,app/name)
  # CMD /S /C needs an outer quote pair around the entire command line.
  command=subprocess.list2cmdline([str(app/'启动.cmd'),'--check','--port',str(self.port),'--data-dir',str(self.data)])
  result=subprocess.run('cmd.exe /d /s /c "'+command+'"',capture_output=True,encoding='utf-8',errors='replace',env=os.environ|{'JINXUE_PYTHON':sys.executable})
  self.assertEqual(result.returncode,0,result.stderr+result.stdout);self.assertEqual(json.loads(result.stdout)['service']['state'],'FREE');self.assertFalse(self.data.exists())
