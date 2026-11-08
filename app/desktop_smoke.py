"""Explicit synthetic native-window smoke test; never used by normal teacher startup."""
import io
import json
from pathlib import Path
import socket
import time
import urllib.request
import zipfile
import webbrowser


def unused_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


SCRIPT = r"""
(async()=>{
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(f)=>{for(let i=0;i<150;i++){if(f())return;await pause(100)}throw Error('native UI did not become ready')};
 await until(()=>!!document.querySelector('.main-nav'));
 const b=await api('bootstrap');if(b.students.length||b.papers.length)throw Error('smoke store must be empty');
 const p=await api('papers',{student_ref:'SYN-DESKTOP-A',student_name:'合成学生A',batch_id:'SYN-DESKTOP-001',title:'桌面合成试卷',questions:[
  {id:'Q01',stem:'求 y=(x-2)²+3 的顶点和对称轴',answer:'(-2,3)，x=-2',correct_answer:'(2,3)，x=2',knowledge:'二次函数顶点式',result:'INCORRECT',cause:'待核实'},
  {id:'Q02',stem:'计算 1+1',answer:'2',correct_answer:'2',knowledge:'整数运算',result:'CORRECT'}]});
 const confirmed=await api('papers/'+p.id+'/confirm',{version:p.version,consent:true});
 if(confirmed.added!==2)throw Error('expected two confirmed synthetic events');
 const e=await api('exercises',{paper_id:p.id,paper_version:p.version,question_id:'Q01',level:'基础巩固',stem:'求 y=(x+1)²-4 的顶点和对称轴',answer:'(-1,-4)，x=-1',explanation:'令括号内为零，求出顶点横坐标，再代回求纵坐标。'});
 await api('exercises/'+e.id+'/approve',{version:e.version,consent:true});
 await api('retests',{exercise_id:e.id,version:e.version,answer:'(-1,-4)，x=-1',condition:'独立完成',result:'CORRECT',consent:true,request_id:'SYN-DESKTOP-RETEST-001'});
 const backup=await api('backups',{});
 await api('papers',{student_ref:'SYN-DESKTOP-A',student_name:'合成学生A',batch_id:'SYN-TEMP',title:'合成恢复前临时稿',questions:[{id:'Q99',stem:'计算 1+1',answer:'2',result:'CORRECT'}]});
 if((await api('bootstrap')).papers.length!==2)throw Error('backup setup did not add a synthetic draft');
 await api('restore',{id:backup.id,confirmation:'RESTORE'});
 if((await api('bootstrap')).papers.length!==1)throw Error('synthetic backup restore did not restore snapshot');
 const click=async(s)=>{const el=document.querySelector(s);if(!el)throw Error('missing '+s);el.click();await pause(180)};
 await click('.main-nav [data-view=registration]');await until(()=>!!document.querySelector('[data-action=registration-refresh]'));await click('[data-action=registration-refresh]');
 await until(()=>!!document.querySelector('[data-action=registration-select]'));await click('[data-action=registration-select]');await until(()=>!!document.querySelector('[data-action=registration-open]'));await click('[data-action=registration-open]');
 await until(()=>!!document.querySelector('#questions'));if(document.querySelectorAll('#questions .question').length!==2)throw Error('native review did not show both questions');
 await click('.main-nav [data-view=profile]');await until(()=>document.querySelector('#profile-content')?.dataset.state==='ready');
 if(!document.querySelector('#archive-priorities').textContent.includes('二次函数顶点式'))throw Error('native archive missing knowledge evidence');
 const profile=await api('profiles/'+p.student_id);if(profile.events.length!==2||profile.retests.length!==1)throw Error('history or retest missing');
 const config=await api('ai/settings');if(config.key_loaded)throw Error('synthetic run must not have a real AI key');
 await click('[data-action=report-preview]');await until(()=>!!document.querySelector('#report-export'));
 await click('input[name=report-format][value=pdf]');await click('#report-consent');await click('#report-export');
 await until(()=>!document.querySelector('#modal').open);
 window.__jinxueSmoke={ok:true,paper_id:p.id,student_id:p.student_id,version:p.version,checks:{native_ui_loaded:true,review_two_questions:true,teacher_confirmation:true,archive_knowledge_visible:true,history_preserved:true,retest_separate:true,no_model_key:true,synthetic_backup_restore:true}};
})().catch(e=>window.__jinxueSmoke={ok:false,error:String(e)})
"""


def run_smoke(window, loaded, service, report, report_path):
    from desktop import write_report
    opened_urls = []
    original_open = webbrowser.open
    # Only synthetic mode captures OS-browser dispatch; normal startup is untouched.
    webbrowser.open = lambda url, *args, **kwargs: opened_urls.append(str(url)) or True
    try:
        if not loaded.wait(40):
            raise RuntimeError('WebView2窗口未在40秒内加载')
        report.update(status='SMOKE_RUNNING', native_renderer='edgechromium')
        write_report(report_path, report)
        window.evaluate_js(SCRIPT)
        result = None
        for _ in range(400):
            result = window.evaluate_js('window.__jinxueSmoke || null')
            if result:
                break
            time.sleep(.1)
        if not result or not result.get('ok'):
            raise RuntimeError((result or {}).get('error', '合成界面检查超时'))
        for _ in range(30):
            if opened_urls:
                break
            time.sleep(.1)
        if len(opened_urls) != 1 or not opened_urls[0].startswith(service.url + '/print/profile/' + result['student_id'] + '?fingerprint='):
            raise RuntimeError('个人报告未交给系统浏览器正确的本机打印地址: ' + repr(opened_urls))
        result['checks']['profile_pdf_native_handoff'] = True
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(opened_urls[0]) as response:
            report_html = response.read().decode('utf-8')
        if '合成学生A' not in report_html or '教师核对稿' not in report_html:
            raise RuntimeError('个人报告打印页内容或快照指纹未通过服务核对')
        result['checks']['profile_print_snapshot_valid'] = True
        suffix = '/paper/' + result['paper_id']
        with opener.open(service.url + '/api/export' + suffix + '.docx?audience=teacher&version=1') as response:
            raw = response.read()
        with zipfile.ZipFile(io.BytesIO(raw)) as word:
            if word.testzip() or 'word/document.xml' not in word.namelist():
                raise RuntimeError('打包后的Word输出无效')
        (Path(report_path).parent / 'synthetic-export.docx').write_bytes(raw)
        with opener.open(service.url + '/print' + suffix + '?audience=teacher&version=1') as response:
            printable = response.read().decode('utf-8')
        if '桌面合成试卷' not in printable:
            raise RuntimeError('打印页未包含合成题目')
        result['checks'].update(docx_valid=True, print_page_valid=True)
        report.update(ok=True, status='SMOKE_PASSED', smoke=result)
        write_report(report_path, report)
        # Brief inspection window for an optional local CDP screenshot driver.
        time.sleep(12)
    except Exception as exc:
        report.update(ok=False, status='SMOKE_FAILED', error=str(exc))
        write_report(report_path, report)
    finally:
        webbrowser.open = original_open
        window.destroy()
