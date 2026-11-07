"""Local teacher launcher: no installs, keys, student reads or process killing."""
import argparse,importlib,importlib.metadata,json,os,socket,subprocess,sys,time,urllib.request,webbrowser,threading
from pathlib import Path

def dependencies():
 packages={};errors=[]
 if sys.version_info<(3,12):errors.append('需要Python 3.12或更高版本')
 for name,module in (('python-docx','docx'),('pypdf','pypdf'),('Pillow','PIL')):
  try:importlib.import_module(module);packages[name]=importlib.metadata.version(name)
  except Exception:errors.append('无法导入依赖：'+name)
 return dict(ok=not errors,python=sys.version.split()[0],executable=sys.executable,packages=packages,errors=errors)
def valid_port(port):
 if type(port) is not int or not 1<=port<=65535:raise ValueError('端口须为1至65535的整数')
 return port
def same_path(a,b):
 return isinstance(a,str) and os.path.normcase(str(Path(a).resolve()))==os.path.normcase(str(Path(b).resolve()))
def identify(health,info,application,data):
 if (not isinstance(health,dict) or health.get('status')!='ok' or health.get('mode')!='LOCAL_STORE_EXPLICIT_AI'
  or not isinstance(info,dict) or not same_path(info.get('application_directory'),application)
  or not same_path(info.get('data_directory'),data)):return 'CONFLICT'
 return 'OWN'
def probe_service(application,data,port):
 valid_port(port);base='http://127.0.0.1:'+str(port)
 try:
  with socket.create_connection(('127.0.0.1',port),timeout=3):pass
 except ConnectionRefusedError:return dict(state='FREE')
 except OSError:return dict(state='UNREACHABLE')
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
 def get(route):
  with opener.open(base+route,timeout=1) as response:
   raw=response.read(16385)
   if len(raw)>16384:raise ValueError('响应过大')
   return json.loads(raw)
 try:
  health=get('/api/health');info=get('/api/launch-info');state=identify(health,info,application,data)
  return dict(state=state,version=health.get('version') if state=='OWN' else None)
 except Exception:return dict(state='CONFLICT')
def preflight(application,data,port,probe=probe_service):
 valid_port(port);runtime=dependencies();service=probe(application,data,port) if runtime['ok'] else dict(state='NOT_CHECKED')
 return dict(dependencies=runtime,service=service,url='http://127.0.0.1:'+str(port),
  ready_to_start=runtime['ok'] and service['state'] in ('FREE','OWN'))
def launch(application,data,port,no_browser=False):
 application=Path(application).resolve();data=Path(data).resolve();report=preflight(application,data,port)
 if not report['ready_to_start']:raise RuntimeError('环境未就绪或端口被其他服务占用；未安装依赖、未结束进程。'+json.dumps(report,ensure_ascii=False))
 report['reused']=report['service']['state']=='OWN'
 if not report['reused']:
  data.mkdir(parents=True,exist_ok=True)
  log=data/'launcher-service.log'
  with log.open('ab') as output:
   child=subprocess.Popen([sys.executable,str(application/'server.py'),'--data-dir',str(data),'--port',str(port)],cwd=application,
    stdin=subprocess.DEVNULL,stdout=output,stderr=output,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
  threading.Thread(target=child.wait,daemon=True).start()
  report['pid']=child.pid;deadline=time.monotonic()+12
  while time.monotonic()<deadline:
   if probe_service(application,data,port)['state']=='OWN':break
   if child.poll() is not None:raise RuntimeError('本次服务启动失败，请查看本机日志：'+str(log))
   time.sleep(.15)
  else:raise RuntimeError('服务未及时就绪；未自动重启或结束进程，请查看：'+str(log))
  report['service']=probe_service(application,data,port)
  if report['service']['state']!='OWN':raise RuntimeError('就绪检查期间服务发生变化；未打开网页、未结束任何进程。请查看：'+str(log))
 if not no_browser:
  try:report['browser_opened']=bool(webbrowser.open(report['url']))
  except Exception:report['browser_opened']=False
  if not report['browser_opened']:report['message']='未能自动打开浏览器，请手动打开：'+report['url']
 return report
def main():
 parser=argparse.ArgumentParser(description='晋学智辅本机启动与只读预检')
 parser.add_argument('--check',action='store_true');parser.add_argument('--runtime-check',action='store_true')
 parser.add_argument('--no-browser',action='store_true');parser.add_argument('--port',type=int,default=8765)
 parser.add_argument('--data-dir',default=str(Path(__file__).resolve().parent/'.local-data'))
 args=parser.parse_args();application=Path(__file__).resolve().parent
 try:
  if args.runtime_check:
   report=dependencies();code=0 if report['ok'] else 1
  elif args.check:
   report=preflight(application,Path(args.data_dir),args.port);code=0 if report['ready_to_start'] else 1
  else:report=launch(application,Path(args.data_dir),args.port,args.no_browser);code=0
 except Exception as exc:report=dict(ok=False,error=str(exc));code=1
 if args.check or args.runtime_check or code:print(json.dumps(report,ensure_ascii=False))
 else:print('晋学智辅已就绪：'+report['url']+'\n'+('已复用原服务。' if report['reused'] else '本机后台服务已启动。')+'关闭浏览器不会停止服务。'+('\n'+report['message'] if report.get('message') else ''))
 return code
if __name__=='__main__':raise SystemExit(main())
