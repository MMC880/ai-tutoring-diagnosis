import { useEffect, useRef, useState } from 'react';

const API = 'http://127.0.0.1:8019';
export type Student = { id: string; name: string; class_name?: string };
type Material = { file: File; thumbnail: string; pages: number | null; warning: string; sha256: string };
type Result = {
  status: string; text: string; flow_id: string; name?: string; class_name?: string; can_create?: boolean;
  matches?: Student[]; file_count?: number; receipt?: { student: Student; subject: string; assignment_id: string };
};
async function jsonResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) throw Error(typeof data.detail === 'string' ? data.detail : '本地处理失败，材料仍保留，可重试');
  return data;
}

export function useIntake(student: Student | null, subject: string, selected: (student: Student, subject: string) => void) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<Result | null>(null);
  const [receipt, setReceipt] = useState('');
  const [correction, setCorrection] = useState('');
  const request = useRef<{ signature: string; id: string } | null>(null);
  const adding = useRef(false);
  const [waiting, setWaiting] = useState<Result[]>([]);
  useEffect(() => { void fetch(`${API}/api/operations`).then(jsonResponse).then(r => setWaiting(r.pending)).catch(() => {}); }, []);
  // Never automatically resend local identity, receipts or history to the model.
  const localTexts = useRef(new Set<string>());

  async function addFiles(incoming: File[]) {
    if (adding.current || working) return;
    adding.current = true; setWorking(true); setNotice('正在接收本地材料…');
    try {
      if (pending) throw Error('请先完成或取消当前学生确认，再添加下一组材料');
      if (materials.length + incoming.length > 12) throw Error('一次最多12份同一学生同一作业的材料');
      const accepted = [...materials];
      for (const file of incoming) {
        const form = new FormData(); form.append('file', file, file.name);
        const info = await jsonResponse(await fetch(`${API}/api/intake/inspect`, { method: 'POST', body: form }));
        if (accepted.some(item => item.sha256 === info.sha256)) {
          setNotice('已跳过本组内容相同的重复文件'); continue;
        }
        accepted.push({ file, thumbnail: info.thumbnail, pages: info.pages, warning: info.warning, sha256: info.sha256 });
        setMaterials([...accepted]);
      }
      setNotice(`本地已接收${accepted.length}份材料，尚未归档。输入学生、科目和“帮我归档”即可。`);
    } catch (error) { setNotice(error instanceof Error ? error.message : '接收失败'); }
    finally { adding.current = false; setWorking(false); }
  }

  function accept(data: Result) {
    setReceipt(data.text);
    if (data.status === 'NEEDS_STUDENT') { setPending(data); return; }
    setPending(null); setCorrection('');
    if (data.status === 'SAVED' && data.receipt) {
      selected(data.receipt.student, data.receipt.subject);
      setMaterials([]); request.current = null;
    }
  }

  async function resolve(studentId?: string, create = false, corrected?: string) {
    if (!pending) return;
    setWorking(true);
    try {
      const data = await jsonResponse(await fetch(`${API}/api/intake/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_id: pending.flow_id, student_id: studentId, confirm_create: create, instruction: corrected || undefined }) }));
      accept(data);
    } catch (error) { setNotice(error instanceof Error ? error.message : '处理失败，原件仍暂存'); }
    finally { setWorking(false); }
  }

  async function handle(text: string, signal: AbortSignal): Promise<string | null> {
    const archive = /归档|存档|(?:帮我|请)保存/.test(text);
    const query = !materials.length && /最近|历史|错过|错题.{0,8}(?:哪些|记录)|出现过几次|知识点/.test(text);
    if (!archive && !query) return null;
    localTexts.current.add(text);
    if (query && !archive) {
      const data = await jsonResponse(await fetch(`${API}/api/intake/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, student_id: student?.id, subject }), signal }));
      localTexts.current.add(data.text); return data.text;
    }
    if (!materials.length) throw Error('请先添加这份作业的照片或PDF；尚未创建归档记录');
    if (pending) throw Error('材料已暂存，请先在确认卡中选择学生或补充说明');
    const signature = JSON.stringify([text, student?.id, subject, materials.map(m => [m.file.name, m.sha256])]);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    const form = new FormData(); form.append('request_id', request.current.id); form.append('instruction', text);
    form.append('subject', subject); if (student) form.append('student_id', student.id);
    for (const material of materials) form.append('files', material.file, material.file.name);
    const data = await jsonResponse(await fetch(`${API}/api/intake`, { method: 'POST', body: form, signal }));
    accept(data); localTexts.current.add(data.text); return data.text;
  }

  async function analysisImages() {
    const images = materials.filter(m => !m.file.name.toLowerCase().endsWith('.pdf'));
    if (images.length > 3) {
      throw Error('材料可正常归档。一次分析最多3张图片，请移除多余图片后发送；未调用模型');
    }
    return Promise.all(images.map(async m => {
      const form = new FormData(); form.append('file', m.file, m.file.name);
      return (await jsonResponse(await fetch(`${API}/api/intake/analysis-image`, { method: 'POST', body: form }))).image as string;
    }));
  }
  function clear() { setMaterials([]); setPending(null); setReceipt(''); setNotice('已清除界面材料；已暂存原件保留，未新增正式归档'); request.current = null; }
  function reset() { setMaterials([]); setPending(null); setReceipt(''); setNotice(''); request.current = null; localTexts.current.clear(); }

  const fileList = <div className="intake-files">
    {materials.map((item, index) => <div className="intake-file" data-testid="intake-file" key={item.sha256}>
      {item.thumbnail ? <img alt={`测试图片：${item.file.name}`} src={item.thumbnail} /> : <span className="file-symbol">{item.file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : '图片'}</span>}
      <div><strong>{item.file.name}</strong><span>{item.pages === null ? '页数待确认' : `${item.pages}页`} · {(item.file.size / 1024 / 1024).toFixed(2)}MB</span>{item.warning ? <span>{item.warning}</span> : null}</div>
      <button type="button" aria-label={`移除${item.file.name}`} disabled={working || !!pending} onClick={() => setMaterials(old => old.filter((_, n) => n !== index))}>移除</button>
    </div>)}
    {materials.length ? <button type="button" disabled={working} onClick={clear}>清除本组材料</button> : null}
    <p role="status">{notice}</p>
  </div>;
  const panel = <>
    {!pending && waiting.length ? <details data-testid="pending-flows"><summary>继续上次待确认任务（{waiting.length}）</summary>{waiting.map(p => <button key={p.flow_id} type="button" disabled={working || materials.length > 0} onClick={() => { setPending(p); setWaiting(w => w.filter(v => v.flow_id !== p.flow_id)); }}>{p.class_name} · {p.name || '姓名待补'} · {p.file_count || ''}份材料</button>)}</details> : null}
    {pending ? <section className="intake-clarification" data-testid="intake-clarification">
      <strong>材料已暂存，请确认学生</strong><p>{pending.class_name} · {pending.name || '姓名待补'}；尚未归档</p>
      {pending.matches?.map(item => <button key={item.id} type="button" disabled={working} onClick={() => void resolve(item.id)}>{item.class_name || '班级待补'} · {item.name}（{item.id}）</button>)}
      {pending.can_create ? <button type="button" disabled={working} onClick={() => void resolve(undefined, true)}>新建档案并继续归档</button> : null}
      <details><summary>修改本次说明</summary><textarea aria-label="修正归档说明" value={correction} onChange={e => setCorrection(e.target.value)} placeholder="学生姓名、班级、科目、日期、错题号，以及帮我归档" /><button type="button" disabled={working || !correction.trim()} onClick={() => void resolve(undefined, false, correction)}>按修正说明继续</button></details>
      <button type="button" disabled={working} onClick={clear}>取消本次归档</button>
    </section> : null}
    {receipt ? <p className="receipt intake-receipt" data-testid="intake-receipt" role="status">{receipt}</p> : null}
  </>;
  return { materials, working, pending, fileList, panel, addFiles, handle, analysisImages, reset, localTexts };
}
