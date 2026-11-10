import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AssistantRuntimeProvider, useLocalRuntime, ThreadPrimitive, MessagePrimitive,
  ComposerPrimitive, SimpleImageAttachmentAdapter, type ChatModelAdapter } from '@assistant-ui/react';
import './style.css';
import { useIntake } from './intake';
import { LearningPanel } from './learning';

const API = 'http://127.0.0.1:8019';
const agentView = new URLSearchParams(location.search).get('floating') === '1';
function notifyProviderChange() {
  const channel = new BroadcastChannel('jinxue-provider');
  channel.postMessage('changed'); channel.close();
}
const SUBJECTS = [
  { id: 'math', label: '数学' },
  { id: 'english', label: '英语' },
  { id: 'physics', label: '物理' },
  { id: 'chemistry', label: '化学' },
];

function Message() {
  return <MessagePrimitive.Root className="message"><MessagePrimitive.Parts /></MessagePrimitive.Root>;
}

function App() {
  const [subject, setSubject] = useState('math');
  const [studentName, setStudentName] = useState('');
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);
  const [pendingName, setPendingName] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [latest, setLatest] = useState('');
  const [imported, setImported] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://discovery-api.intern-ai.org.cn/v1');
  const [model, setModel] = useState('deepseek-v4.1-flash-1017');
  const [apiKey, setApiKey] = useState('');
  const [providerReady, setProviderReady] = useState(false);
  const [configBusy, setConfigBusy] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [connection, setConnection] = useState('未配置，当前为本地模拟');
  const [allowSave, setAllowSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<{ id: string; markdown: string }[]>([]);
  const [receipts, setReceipts] = useState<{ id: string; relative_path: string; sha256: string }[]>([]);
  const [chatError, setChatError] = useState('');
  const [taskStatus, setTaskStatus] = useState('就绪：添加作业后交代任务');
  const [openingAgent, setOpeningAgent] = useState(false);
  const [contextReady, setContextReady] = useState(!agentView);
  const keepConversation = useRef(false);
  const blockedHistory = useRef(new Set<string>());
  const closeHistoryScope = useRef<() => void>(() => {});
  const intake = useIntake(student, subject, (chosen, chosenSubject) => {
    keepConversation.current = true;
    if (student?.id !== chosen.id || subject !== chosenSubject) {
      closeHistoryScope.current();
      setImported(''); setAllowSave(false); setNotes([]); setReceipts([]);
    }
    setStudent(chosen); setStudentName(chosen.name); setSubject(chosenSubject);
  });
  const adapter: ChatModelAdapter = useMemo(() => ({
    async run({ messages, abortSignal }) {
      setChatError('');
      const last = messages.filter(m => m.role === 'user').at(-1);
      const text = last?.content.filter(p => p.type === 'text').map(p => p.text).join('\n') || '图片接收测试';
      const history = messages.filter(m => (m.role === 'user' || m.role === 'assistant') && m !== last)
        .filter(m => !blockedHistory.current.has(m.id))
        .filter(m => !intake.localTexts.current.has(m.content.filter(p => p.type === 'text').map(p => p.text).join('\n'))).slice(-10)
        .map(m => ({ role: m.role, text: m.content.filter(p => p.type === 'text').map(p => p.text).join('\n').slice(0, 8000) }));
      setBusy(true);
      setTaskStatus('正在处理本次任务，请稍候…');
      try {
        if (agentView) {
          const local = await intake.handle(text, abortSignal);
          if (local !== null) { setTaskStatus('本地处理完成，请核对回执'); return { content: [{ type: 'text', text: local }] }; }
          if (intake.pending) throw Error('请先完成当前归档确认，再开始模型分析');
        }
        const images = agentView ? await intake.analysisImages() :
          (last?.attachments ?? []).flatMap(a => a.content.filter(p => p.type === 'image').map(p => p.image));
        const response = await fetch(`${API}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, images, history, image_count: images.length, imported_summary: imported,
            student_id: student?.id, subject, allow_save: allowSave }), signal: abortSignal });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '模型请求失败');
        setReceipts(data.receipts ?? []);
        setTaskStatus(data.mode === 'simulation' ? '模拟通信完成：未调用真实模型' : '模型已回复：建议仍需教师核对');
        if (student && data.receipts?.length) {
          const readback = await fetch(`${API}/api/students/${student.id}/subjects/${subject}/agent-notes`).then(r => r.json());
          setNotes(readback.notes ?? []);
        }
        return { content: [{ type: 'text', text: data.text }] };
      } catch (error) {
        setTaskStatus(abortSignal.aborted ? '已停止等待；上游可能仍在处理，本地归档请先查询回执再重试' : '本次未完成；材料保留，可修改后重试，未自动重发');
        if (!abortSignal.aborted) setChatError(error instanceof Error ? error.message : '请求失败，未切换为模拟');
        throw error;
      } finally { setBusy(false); }
    },
  }), [imported, student, subject, allowSave, intake]);
  const runtime = useLocalRuntime(adapter, { adapters: { attachments: new SimpleImageAttachmentAdapter() } });
  closeHistoryScope.current = () => {
    for (const message of runtime.thread.getState().messages) blockedHistory.current.add(message.id);
  };
  const [health, setHealth] = useState('连接中');
  const [skill, setSkill] = useState('读取中');
  const [previews, setPreviews] = useState<{ name: string; src: string }[]>([]);
  const [notice, setNotice] = useState('');
  async function configureProvider() {
    setConfigBusy(true);
    setConnection('正在配置并测试…');
    try {
      const response = await fetch(`${API}/api/provider`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: baseUrl, model, api_key: apiKey }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : '配置无效');
      setApiKey(''); setProviderReady(true); setConfigDirty(false);
      const test = await fetch(`${API}/api/provider/test`, { method: 'POST' });
      const data = await test.json();
      if (!test.ok) throw new Error(data.detail || '连接失败');
      setConnection(`文字连接成功：${data.model}；图片和工具需单独验证`);
    } catch (error) { setConnection(error instanceof Error ? error.message : '连接失败'); }
    finally { setConfigBusy(false); notifyProviderChange(); }
  }
  async function showAgent() {
    setOpeningAgent(true);
    try {
      if (window.jinxueDesktop) {
        const result = await window.jinxueDesktop.openAgent({ subject, studentId: student?.id });
        setNotice(result.opened ? 'AI Agent 已打开，沿用当前AI服务与学生学科；历史材料需主动导入' : '已回到打开的 AI Agent，保留该窗口原有对话和学生选择');
      } else {
        const params = new URLSearchParams({ floating: '1', subject });
        if (student) params.set('student', student.id);
        const popup = window.open(`/?${params}`, 'jinxue-agent');
        if (!popup) throw new Error('浏览器阻止了聊天窗口，请允许本站弹出窗口后重试');
        popup.focus();
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : '无法打开 AI Agent'); }
    finally { setOpeningAgent(false); }
  }
  useEffect(() => runtime.thread.composer.subscribe(() => {
    if (runtime.thread.composer.getState().attachments.length === 0) setPreviews([]);
  }), [runtime]);
  useEffect(() => {
    Promise.all([fetch(`${API}/health`).then(r => r.json()), fetch(`${API}/api/skill`).then(r => r.json())])
      .then(([h, s]) => { setHealth(h.status === 'ok' ? '后端已连接' : '连接失败'); setSkill(s.display_name || '读取失败'); })
      .catch(() => setHealth('连接失败，请启动本地服务'));
  }, []);
  useEffect(() => {
    function refreshProvider() { void fetch(`${API}/api/provider`).then(r => r.json()).then(data => {
      setProviderReady(data.key_loaded); setBaseUrl(data.base_url); setModel(data.model);
      setConnection(data.key_loaded ? (data.connection === 'PASS' ? `文字连接成功：${data.model}` : '已配置，请在AI服务中测试连接') : '未配置，当前为本地模拟');
    }).catch(() => { if (agentView) setConnection('AI服务状态读取失败，请检查本地服务'); }); }
    refreshProvider();
    if (!agentView) return;
    const channel = new BroadcastChannel('jinxue-provider');
    channel.onmessage = refreshProvider;
    window.addEventListener('focus', refreshProvider);
    return () => { channel.close(); window.removeEventListener('focus', refreshProvider); };
  }, []);
  useEffect(() => {
    if (!agentView) return;
    let current = true;
    const params = new URLSearchParams(location.search);
    const context = window.jinxueDesktop ? window.jinxueDesktop.getAgentContext()
      : Promise.resolve({ subject: params.get('subject') ?? 'math', studentId: params.get('student') });
    void context.then(async selected => {
      if (!current) return;
      if (SUBJECTS.some(item => item.id === selected.subject)) setSubject(selected.subject);
      if (!selected.studentId) return;
      const response = await fetch(`${API}/api/students`);
      if (!response.ok) throw new Error('学生选择读取失败，请在聊天窗口重新选择');
      const data = await response.json();
      if (!current) return;
      const found = data.students?.find((item: { id: string }) => item.id === selected.studentId);
      if (found) { setStudent(found); setStudentName(found.name); }
      else setNotice('原先选中的学生已不存在，请展开“学生档案”重新选择');
    }).catch(() => { if (current) setNotice('未带入学生选择，可展开“学生档案”重新选择'); })
      .finally(() => { if (current) setContextReady(true); });
    return () => { current = false; };
  }, []);

  async function addFiles(files: File[]) {
    if (busy || configBusy) return;
    if (agentView) { await intake.addFiles(files); return; }
    setNotice('');
    try {
      const incoming = files.filter(file => file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.pdf'));
      if (!incoming.length) throw new Error('请拖入图片或PDF');
      if (incoming.filter(file => file.type.startsWith('image/')).length + runtime.thread.composer.getState().attachments.length > 3) {
        throw new Error('对话附件最多3张图片');
      }
      for (const file of incoming) {
        if (file.type.startsWith('image/')) {
          if (file.size > 2 * 1024 * 1024) throw new Error('对话预览图片不能超过2MB');
          const form = new FormData(); form.append('file', file);
          const result = await fetch(`${API}/api/images`, { method: 'POST', body: form });
          if (!result.ok) throw new Error((await result.json()).detail || '图片接收失败');
          await runtime.thread.composer.addAttachment(file);
          const src = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file);
          });
          setPreviews(old => [...old, { name: file.name, src }]);
        }
        setFiles(old => [...old, file]);
        setNotice(file.type.startsWith('image/') ? '图片接收成功，可保存到该生该科档案' : '材料已接收，可保存到该生该科档案');
      }
    } catch (e) { setNotice(e instanceof Error ? e.message : '图片处理失败'); }
  }

  async function findStudent(confirmNew = false) {
    setNotice('');
    const response = await fetch(`${API}/api/students`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: studentName, confirm_new: confirmNew }) });
    const data = await response.json();
    if (!response.ok) { setNotice(data.detail || '无法处理学生称呼'); return; }
    if (data.status === 'needs_create') { setPendingName(data.name); setNotice(`系统里还没有“${data.name}”，确认后新建档案`); return; }
    if (data.status === 'ambiguous') { setNotice('有重名学生，请在归档指令中说明班级，确认卡会列出候选'); return; }
    setStudent(data.student); setPendingName(''); setNotice(`已选择 ${data.student.name}`);
  }

  async function saveAssignment() {
    if (!student) { setNotice('请先选择或新建学生'); return; }
    if (!files.length) { setNotice('请先拖入该生该科作业原件'); return; }
    const form = new FormData();
    form.append('teacher_note', note);
    for (const file of files) form.append('files', file, file.name);
    const response = await fetch(`${API}/api/students/${student.id}/subjects/${subject}/assignments`, { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) { setNotice(data.detail || '保存失败'); return; }
    setLatest(data.markdown); setFiles([]);
    await runtime.thread.composer.clearAttachments();
    setPreviews([]); setNotice(`已保存 ${data.subject_label} 作业 ${data.assignment_id}；如需给Agent查看，请再选择图片或导入摘要`);
  }

  useEffect(() => {
    if (keepConversation.current) { keepConversation.current = false; }
    else {
      runtime.thread.cancelRun(); runtime.thread.reset(); intake.reset();
      blockedHistory.current.clear();
      setImported(''); setFiles([]); setPreviews([]); setReceipts([]); setNotes([]); setAllowSave(false);
    }
    if (!student) { setLatest(''); return; }
    let current = true;
    fetch(`${API}/api/students/${student.id}/subjects/${subject}/latest`)
      .then(r => r.json())
      .then(data => { if (current) setLatest(data.markdown || ''); })
      .catch(() => { if (current) setLatest('读取摘要失败'); });
    fetch(`${API}/api/students/${student.id}/subjects/${subject}/agent-notes`).then(r => r.json())
      .then(data => { if (current) setNotes(data.notes ?? []); }).catch(() => {});
    return () => { current = false; };
  }, [student, subject]);

  const studentControls = <section className="student-bar">
    <label>学生称呼<input aria-label="学生称呼" disabled={busy} value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="例如王小明" /></label>
    <button type="button" disabled={busy} onClick={() => void findStudent(false)}>选择或查找</button>
    {pendingName ? <button type="button" disabled={busy} onClick={() => void findStudent(true)}>新建 {pendingName}</button> : null}
    <span data-testid="current-student">{student ? `当前：${student.name}` : '尚未选择学生'}</span>
  </section>;
  const archiveControls = <>
    <label className="note">老师说明<textarea aria-label="老师说明" value={note} onChange={e => setNote(e.target.value)} placeholder="例如：今天作业，第3、5、8题错" /></label>
    <div className="actions">
      <button type="button" disabled={busy || configBusy} onClick={() => void saveAssignment()}>保存到该生该科档案</button>
      <button type="button" disabled={busy || configBusy} data-testid="import-latest" onClick={() => { setImported(latest); setNotice(latest ? '已准备导入该生该科最新摘要，发送消息时会带上摘要' : '还没有可导入的摘要'); }}>导入最新摘要</button>
    </div>
    <pre className="summary" data-testid="latest-summary">{latest || '该生该科尚无摘要'}</pre>
    <label><input type="checkbox" aria-label="允许保存AI待确认笔记" disabled={!student || busy} checked={allowSave} onChange={e => setAllowSave(e.target.checked)} />允许Agent按本次指令保存该生该科的AI待确认笔记（不改正式学情）</label>
  </>;
  const subjectButtons = <section className="subjects" role="group" aria-label="学科">
    {SUBJECTS.map(item => <button key={item.id} aria-pressed={subject === item.id} disabled={busy} type="button" className={subject === item.id ? 'active' : ''} data-testid={`subject-${item.id}`} onClick={() => setSubject(item.id)}>{item.label}</button>)}
  </section>;
  return <main className={agentView ? 'agent-window' : undefined}>
    {agentView ? <>
      <header className="agent-header"><div><h1>AI Agent</h1><span className="muted">晋学智辅 · {student ? student.name : '自由对话'}</span></div><span className="badge" data-testid="health">{health}</span></header>
      <div className="agent-model"><strong>{model}</strong><span data-testid="agent-connection" role="status">{connection}</span></div>
      {subjectButtons}
    </> : <>
    <header><div><span className="eyebrow">晋学智辅 2.0</span><h1>本地学习档案工作台</h1></div><span className="badge" data-testid="health">{health}</span></header>
    <p className="muted">{providerReady ? '已配置真实模型。发送会把本次文字、图片及主动导入的摘要交给所配接口；请先核对材料。' : '当前为本地模拟。填写AI服务后可测试真实模型。'} 原件与AI待确认笔记分开保存。</p>
    <details className="provider" open><summary>AI服务设置与连接测试</summary>
      <label>接口地址<input aria-label="API地址" disabled={busy || configBusy} value={baseUrl} onChange={e => { setBaseUrl(e.target.value); setConfigDirty(true); setConnection('地址草稿已修改，重新配置测试前暂停发送'); }} /></label>
      <label>模型ID<input aria-label="模型ID" disabled={busy || configBusy} value={model} onChange={e => { setModel(e.target.value); setConfigDirty(true); setConnection('模型草稿已修改，重新配置测试前暂停发送'); }} /></label>
      <label>API Key（仅后端进程内存，退出后清除）<input aria-label="API密钥" disabled={busy || configBusy} type="password" autoComplete="off" value={apiKey} onChange={e => { setApiKey(e.target.value); setConfigDirty(true); }} /></label>
      <button type="button" disabled={busy || configBusy || !apiKey} onClick={() => void configureProvider()}>配置并测试文字连接</button>
      <button type="button" disabled={busy || configBusy} onClick={async () => { await fetch(`${API}/api/provider/clear`, { method: 'POST' }); setApiKey(''); setProviderReady(false); setConfigDirty(false); setConnection('密钥已清除，恢复本地模拟'); notifyProviderChange(); }}>清除本次密钥</button>
      <p data-testid="provider-status" role="status">{connection}</p>
      <div className="agent-launch"><div><strong>AI Agent</strong><p className="muted">打开独立聊天窗口，添加图片并交代任务。</p></div><button type="button" disabled={openingAgent || configBusy || configDirty} onClick={() => void showAgent()}>打开 AI Agent</button></div>
    </details>
    <section className="status"><span>中文教学技能：<strong data-testid="skill">{subject === 'math' ? skill : '通用分析，学科专用技能待配置'}</strong></span><a href="/copilot.html">打开 CopilotKit 独立实验</a></section>
    {subjectButtons}
    {studentControls}
    <LearningPanel student={student} subject={subject} />
    </>}
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="thread">
        {agentView ? <details className="agent-archive"><summary>学生档案{student ? ` · ${student.name}` : '（需要保存时再选择）'}</summary>{studentControls}{archiveControls}
          <details><summary>本地AI待确认笔记（{notes.length}）</summary>{notes.map(item => <section key={item.id}>
            <button type="button" data-testid="import-agent-note" disabled={busy || configBusy} onClick={() => { setImported(item.markdown); setNotice('已准备导入这份AI待确认笔记，发送时携带；不代表老师已确认'); }}>导入这份笔记继续讨论</button><pre className="summary" data-testid="agent-note">{item.markdown}</pre>
          </section>)}</details>
        </details> : null}
        <ThreadPrimitive.Viewport className="messages">
          {agentView ? <ThreadPrimitive.Empty><div className="agent-empty"><h2>拖入作业，告诉我是谁的</h2><p>例如：这是九年级一班学生A今天的数学作业，帮我归档。错题是第3、5、8题。</p></div></ThreadPrimitive.Empty> : null}
          <ThreadPrimitive.Messages components={{ UserMessage: Message, AssistantMessage: Message }} />
          {agentView ? intake.panel : null}
        </ThreadPrimitive.Viewport>
        <section className="drop" data-testid="dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void addFiles(Array.from(e.dataTransfer.files)); }}>
          <label>{agentView ? '添加图片或PDF（最多12份，每份15MB），也可拖到这里' : '拖入该生该科作业原件，或选择图片（对话预览最多3张）'}<input aria-label="添加测试图片" disabled={busy || intake.working} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple onChange={e => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} /></label>
          {agentView ? intake.fileList : <div className="previews">{previews.map((p, i) => <figure key={i}><img alt={`测试图片：${p.name}`} src={p.src} /><figcaption>{p.name}</figcaption></figure>)}</div>}
          <p role="status">{notice}</p>
        </section>
        {!agentView ? archiveControls : null}
        {agentView ? <details className="agent-scope muted"><summary>本次材料范围与图片说明</summary>归档/查询仅本地。其他分析发送本次文字、最近10条非归档对话、最多3张所选图片{imported ? '及主动导入摘要' : ''}；请先去标识。自动生成最长边2000像素的分析副本，细小字迹需核对；原件不变，PDF不外发。</details> : <p className="muted">本次发送：当前消息、最多3张所选图片、当前对话最近10条文字{imported ? '、主动导入的摘要' : ''}。发送前请自行遮去姓名、学校等身份信息；PDF仅保存在本地。</p>}
        <ComposerPrimitive.Root className="composer"><ComposerPrimitive.Input aria-label="消息" disabled={!contextReady || intake.working} placeholder={agentView ? '学生A今天的数学作业，帮我归档，第3、5题错' : '例如：请分析这道题，标出待核实之处'} /><ComposerPrimitive.Send disabled={!contextReady || configBusy || configDirty || intake.working}>发送</ComposerPrimitive.Send></ComposerPrimitive.Root>
        {chatError ? <p role="alert">{chatError}</p> : null}
        <p className="task-status" role="status" data-testid="task-status">{taskStatus}</p>
        {receipts.map(item => <p className="receipt" data-testid="agent-receipt" key={item.id}>已写入并回读待确认笔记：{item.relative_path} · SHA-256 {item.sha256}</p>)}
        {!agentView ? <details><summary>本地AI待确认笔记（{notes.length}）</summary>{notes.map(item => <section key={item.id}>
          <button type="button" data-testid="import-agent-note" disabled={busy || configBusy} onClick={() => { setImported(item.markdown); setNotice('已准备导入这份AI待确认笔记，发送时携带；不代表老师已确认'); }}>导入这份笔记继续讨论</button>
          <pre className="summary" data-testid="agent-note">{item.markdown}</pre>
        </section>)}</details> : null}
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
    <p className="muted agent-footnote">{agentView ? '模型在主窗口的AI服务中设置。关闭或刷新会清空未保存对话。' : 'AI服务内点击“打开 AI Agent”即可聊天。刷新页面会清空本次对话；已保存的摘要仍在本地档案。'}</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
