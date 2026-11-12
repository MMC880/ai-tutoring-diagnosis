import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AssistantRuntimeProvider, useLocalRuntime, ThreadPrimitive, MessagePrimitive,
  ComposerPrimitive, SimpleImageAttachmentAdapter, type ChatModelAdapter } from '@assistant-ui/react';
import './style.css';
import { useIntake, type Student } from './intake';
import { LearningPanel } from './learning';
import { OperationsPanel } from './operations';

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
  const [student, setStudent] = useState<Student | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState('');
  const [studentFilter, setStudentFilter] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  const rosterRequest = useRef<AbortController | null>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const [pendingName, setPendingName] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [archiveGeneration, refreshArchive] = useState(0);
  const formRequest = useRef(crypto.randomUUID());
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
  const [allowHistory, setAllowHistory] = useState(false);
  const [allowOriginals, setAllowOriginals] = useState(false);
  const [assignmentContext, setAssignmentContext] = useState<{ studentId: string; subject: string; id: string } | null>(null);
  const [archivedAssignments, setArchivedAssignments] = useState<{ assignment_id: string; assignment_date: string; file_count: number; questions: string[] }[]>([]);
  const [assignmentError, setAssignmentError] = useState('');
  const selectedAssignment = assignmentContext?.studentId === student?.id && assignmentContext?.subject === subject ? assignmentContext.id : '';
  useEffect(() => { if (!agentView) setAssignmentContext(null); }, [student?.id, subject]);
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
      setImported(''); setAllowSave(false); setAllowHistory(false); setAllowOriginals(false); setNotes([]); setReceipts([]);
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
          const local = await intake.handle(text, abortSignal, allowHistory || (!!selectedAssignment && allowOriginals));
          if (local !== null) { setTaskStatus('本地处理完成，请核对回执'); return { content: [{ type: 'text', text: local }] }; }
          if (intake.pending) throw Error('请先完成当前归档确认，再开始模型分析');
        }
        const images = agentView ? await intake.analysisImages() :
          (last?.attachments ?? []).flatMap(a => a.content.filter(p => p.type === 'image').map(p => p.image));
        const response = await fetch(`${API}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, images, history, image_count: images.length, imported_summary: imported,
            student_id: student?.id, subject, assignment_id: selectedAssignment || undefined,
            allow_history: allowHistory, allow_originals: allowOriginals, allow_save: allowSave }), signal: abortSignal });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '模型请求失败');
        setReceipts(data.receipts ?? []);
        setTaskStatus(data.mode === 'simulation' ? '模拟通信完成：未调用真实模型' : '模型已回复：建议仍需教师核对');
        if (student && data.receipts?.length) {
          const readback = await fetch(`${API}/api/students/${student.id}/subjects/${subject}/agent-notes`).then(r => r.json());
          if (!abortSignal.aborted) setNotes(readback.notes ?? []);
        }
        return { content: [{ type: 'text', text: data.text }] };
      } catch (error) {
        setTaskStatus(abortSignal.aborted ? '已停止等待；上游可能仍在处理，本地归档请先查询回执再重试' : '本次未完成；材料保留，可修改后重试，未自动重发');
        if (!abortSignal.aborted) setChatError(error instanceof Error ? error.message : '请求失败，未切换为模拟');
        throw error;
      } finally { setBusy(false); }
    },
  }), [imported, student, subject, allowSave, allowHistory, allowOriginals, selectedAssignment, intake]);
  const runtime = useLocalRuntime(adapter, { adapters: { attachments: new SimpleImageAttachmentAdapter() } });
  closeHistoryScope.current = () => {
    for (const message of runtime.thread.getState().messages) blockedHistory.current.add(message.id);
  };
  const [health, setHealth] = useState('连接中');
  const [skill, setSkill] = useState('读取中');
  const [previews, setPreviews] = useState<{ name: string; src: string }[]>([]);
  const [notice, setNotice] = useState('');
  const loadStudents = useCallback(async () => {
    rosterRequest.current?.abort();
    const request = new AbortController(); rosterRequest.current = request;
    setStudentsLoading(true); setStudentsError('');
    try {
      const response = await fetch(`${API}/api/students`, { signal: request.signal });
      if (!response.ok) throw new Error('学生名单暂时读取失败，已保存的档案不会因此删除。');
      const data = await response.json();
      if (!Array.isArray(data.students)) throw new Error('学生名单返回异常，请重试。');
      if (!request.signal.aborted) setStudents(data.students);
    } catch (error) {
      if (!request.signal.aborted) setStudentsError(error instanceof Error ? error.message : '学生名单读取失败，请重试。');
    } finally { if (!request.signal.aborted) setStudentsLoading(false); }
  }, []);
  useEffect(() => {
    if (agentView) return;
    void loadStudents();
    const refresh = () => { void loadStudents(); };
    window.addEventListener('focus', refresh);
    return () => { rosterRequest.current?.abort(); window.removeEventListener('focus', refresh); };
  }, [loadStudents]);
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
        const result = await window.jinxueDesktop.openAgent({ subject, studentId: student?.id, assignmentId: selectedAssignment || undefined });
        setNotice(result.opened ? 'AI Agent 已打开并带入所选作业；历史和原图需在窗口中授权读取' : '已回到打开的 AI Agent，保留该窗口原有对话和学生选择');
      } else {
        const params = new URLSearchParams({ floating: '1', subject });
        if (student) params.set('student', student.id);
        if (selectedAssignment) params.set('assignment', selectedAssignment);
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
      : Promise.resolve({ subject: params.get('subject') ?? 'math', studentId: params.get('student'), assignmentId: params.get('assignment') });
    void context.then(async selected => {
      if (!current) return;
      if (SUBJECTS.some(item => item.id === selected.subject)) setSubject(selected.subject);
      if (!selected.studentId) return;
      const response = await fetch(`${API}/api/students`);
      if (!response.ok) throw new Error('学生选择读取失败，请在聊天窗口重新选择');
      const data = await response.json();
      if (!current) return;
      const found = data.students?.find((item: { id: string }) => item.id === selected.studentId);
      if (found) { setStudent(found); setStudentName(found.name);
        if (selected.assignmentId) setAssignmentContext({ studentId: found.id, subject: selected.subject, id: selected.assignmentId }); }
      else setNotice('原先选中的学生已不存在，请展开“学生档案”重新选择');
    }).catch(() => { if (current) setNotice('未带入学生选择，可展开“学生档案”重新选择'); })
      .finally(() => { if (current) setContextReady(true); });
    return () => { current = false; };
  }, []);
  useEffect(() => {
    setArchivedAssignments([]); setAssignmentError('');
    if (!agentView || !student) return;
    const controller = new AbortController();
    void fetch(`${API}/api/learning/workspace?student_id=${encodeURIComponent(student.id)}&subject=${subject}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw Error('作业列表读取失败，请重开窗口重试；未发送历史资料'); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setArchivedAssignments(data.assignments); })
      .catch(error => { if (!controller.signal.aborted) setAssignmentError(error.message); });
    return () => controller.abort();
  }, [student?.id, subject, archiveGeneration]);

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
    try {
    const response = await fetch(`${API}/api/students`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: studentName, confirm_new: confirmNew }) });
    const data = await response.json();
    if (!response.ok) { setNotice(data.detail || '无法处理学生称呼'); return; }
    if (data.status === 'needs_create') { setPendingName(data.name); setNotice(`系统里还没有“${data.name}”，确认后新建档案`); return; }
    if (data.status === 'ambiguous') { setNotice('有重名学生，请在归档指令中说明班级，确认卡会列出候选'); return; }
    setStudent(data.student); setPendingName(''); setNotice(`已选择 ${data.student.name}`);
    if (!agentView) { setAddingStudent(false); setStudentFilter(''); await loadStudents(); }
    } catch { setNotice('学生选择未完成，请检查本地服务后重试。'); }
  }

  useEffect(() => { formRequest.current = crypto.randomUUID(); }, [student?.id, subject, note, files]);

  async function saveAssignment() {
    if (!student) { setNotice('请先选择或新建学生'); return; }
    if (!files.length) { setNotice('请先拖入该生该科作业原件'); return; }
    const form = new FormData();
    form.append('teacher_note', note);
    form.append('request_id', formRequest.current);
    for (const file of files) form.append('files', file, file.name);
    const response = await fetch(`${API}/api/students/${student.id}/subjects/${subject}/assignments`, { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) { setNotice(data.detail || '保存失败'); return; }
    setLatest(data.markdown); setFiles([]); formRequest.current = crypto.randomUUID(); refreshArchive(g => g + 1);
    await runtime.thread.composer.clearAttachments();
    setPreviews([]); setNotice(`已保存 ${data.subject_label} 作业 ${data.assignment_id}；如需给Agent查看，请再选择图片或导入摘要`);
  }

  useEffect(() => {
    if (keepConversation.current) { keepConversation.current = false; }
    else {
      runtime.thread.cancelRun(); runtime.thread.reset(); intake.reset();
      blockedHistory.current.clear();
      setImported(''); setFiles([]); setPreviews([]); setReceipts([]); setNotes([]); setAllowSave(false); setAllowHistory(false); setAllowOriginals(false);
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
    <label>学生称呼<input aria-label="学生称呼" disabled={busy} value={studentName} onChange={e => { setStudentName(e.target.value); setPendingName(''); }} placeholder="例如王小明" /></label>
    <button type="button" disabled={busy} onClick={() => void findStudent(false)}>选择或查找</button>
    {pendingName ? <button type="button" disabled={busy} onClick={() => void findStudent(true)}>新建 {pendingName}</button> : null}
    {agentView ? <span data-testid="current-student">{student ? `当前：${student.name}` : '尚未选择学生'}</span> : null}
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
    <header className="home-header"><div><span className="eyebrow">晋学智辅 2.0</span><h1>本地学习档案工作台</h1><span className="badge" data-testid="health">{health}</span></div>
      <div className="home-actions"><button type="button" className="secondary" onClick={() => settingsDialog.current?.showModal()}>AI 服务设置</button>
        <button type="button" disabled={openingAgent || configBusy || configDirty} onClick={() => void showAgent()}>打开 AI Agent</button></div>
    </header>
    <p className="home-hint muted">先选学科，再点学生查看档案。收作业或分析题目，点右上方“打开 AI Agent”。</p>
    {configDirty ? <p className="settings-warning" role="status">AI 设置尚未完成测试，发送已暂停。请点“AI 服务设置”完成配置；本地档案仍可查看。</p> : null}
    <dialog className="provider settings-dialog" ref={settingsDialog} aria-labelledby="settings-title" onCancel={e => { if (configBusy) e.preventDefault(); }}>
      <div className="settings-heading"><h2 id="settings-title">AI 服务设置</h2><button type="button" className="secondary" disabled={configBusy} onClick={() => settingsDialog.current?.close()}>关闭设置</button></div>
      <p className="muted">{providerReady ? '已配置真实模型。' : '当前为本地模拟。'} 本地归档、查档无需密钥。配置真实模型后，分析会发送本次文字、图片及主动导入的摘要，请先核对材料。</p>
      <label>接口地址<input aria-label="API地址" disabled={busy || configBusy} value={baseUrl} onChange={e => { setBaseUrl(e.target.value); setConfigDirty(true); setConnection('地址草稿已修改，重新配置测试前暂停发送'); }} /></label>
      <label>模型ID<input aria-label="模型ID" disabled={busy || configBusy} value={model} onChange={e => { setModel(e.target.value); setConfigDirty(true); setConnection('模型草稿已修改，重新配置测试前暂停发送'); }} /></label>
      <label>API Key（仅后端进程内存，退出后清除）<input aria-label="API密钥" disabled={busy || configBusy} type="password" autoComplete="off" value={apiKey} onChange={e => { setApiKey(e.target.value); setConfigDirty(true); setConnection('密钥草稿已修改，重新配置测试前暂停发送'); }} /></label>
      <button type="button" disabled={busy || configBusy || !apiKey} onClick={() => void configureProvider()}>配置并测试文字连接</button>
      <button type="button" disabled={busy || configBusy} onClick={async () => { await fetch(`${API}/api/provider/clear`, { method: 'POST' }); setApiKey(''); setProviderReady(false); setConfigDirty(false); setConnection('密钥已清除，恢复本地模拟'); notifyProviderChange(); }}>清除本次密钥</button>
      <p data-testid="provider-status" role="status">{connection}</p>
    </dialog>
    {subjectButtons}
    <section className="student-picker" aria-label="学生名单">
      <div className="student-picker-heading"><h2>点选学生，查看档案</h2><button type="button" className="secondary" disabled={busy} aria-expanded={addingStudent} onClick={() => { setAddingStudent(v => !v); setPendingName(''); }}>添加学生</button></div>
      <div className="student-filter"><label>筛选学生（选填）<input aria-label="筛选学生" value={studentFilter} placeholder="名单可直接点选，也可输入姓名、班级或编号" onChange={e => setStudentFilter(e.target.value)} /></label>{studentFilter ? <button type="button" className="secondary" onClick={() => setStudentFilter('')}>清除筛选</button> : null}</div>
      {studentsError ? <div data-testid="student-list-error" role="alert"><p>{studentsError}</p><button type="button" disabled={studentsLoading} onClick={() => void loadStudents()}>重试读取学生</button></div>
        : studentsLoading && !students.length ? <p role="status">正在读取学生名单…</p>
        : !students.length ? <p className="muted" data-testid="student-list-empty">还没有学生。点“添加学生”，或在 AI Agent 中提交作业并确认新建档案。</p>
        : <><div className="student-list" data-testid="student-list" aria-label="可点选学生">
          {students.filter(item => `${item.name} ${item.class_name ?? ''} ${item.id}`.toLowerCase().includes(studentFilter.trim().toLowerCase())).map(item => <button type="button" key={item.id} disabled={busy} aria-pressed={student?.id === item.id} onClick={() => {
            if (student?.id !== item.id) setStudent(item);
            setStudentName(item.name); setPendingName(''); setNotice('');
          }}><strong>{item.name}</strong><span>{item.class_name || '班级待补'} · {item.id}</span></button>)}
        </div>{!students.some(item => `${item.name} ${item.class_name ?? ''} ${item.id}`.toLowerCase().includes(studentFilter.trim().toLowerCase())) ? <p className="muted" data-testid="student-filter-empty">没有符合筛选的学生，可清除筛选查看全部名单。</p> : null}</>}
      {addingStudent ? <div className="add-student-form">{studentControls}<p className="muted">已有学生直接点上面的名单，无需再查找。新学生核对称呼后再确认新建。</p></div> : null}
      <p className="selected-student" data-testid="current-student" role="status">{student ? `当前：${student.name} · ${student.class_name || '班级待补'} · ${student.id} · ${SUBJECTS.find(item => item.id === subject)?.label}` : '还未选择学生，请点上方名单。'}</p>
    </section>
      <LearningPanel student={student} subject={subject} refreshKey={archiveGeneration} onAssignmentChange={id => setAssignmentContext(student ? { studentId: student.id, subject, id } : null)} />
    <OperationsPanel />
    <section className="status"><span>中文教学技能：<strong data-testid="skill">{subject === 'math' ? skill : '通用分析，学科专用技能待配置'}</strong></span>{import.meta.env.DEV ? <a href="/copilot.html">打开 CopilotKit 独立实验</a> : null}</section>
    </>}
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="thread">
        {agentView && student ? <details className="agent-scope" data-testid="history-access"><summary>读取这名学生的已归档作业（需授权）</summary>
          <p>仅限当前 {student.name} · {SUBJECTS.find(s => s.id === subject)?.label}。先查错题与知识点记录，需要时再读图片；权限不随窗口重开或学生、学科切换保留。</p>
          <label>本次分析作业<select aria-label="Agent分析作业" disabled={busy} value={selectedAssignment} onChange={e => setAssignmentContext({ studentId: student.id, subject, id: e.target.value })}><option value="">未指定作业</option>{archivedAssignments.map(a => <option key={a.assignment_id} value={a.assignment_id}>{a.assignment_date} · {a.assignment_id} · {a.file_count}份 · 问题题号{a.questions.join('、') || '待补'}</option>)}</select></label>
          {assignmentError ? <p role="alert">{assignmentError}</p> : null}
          <label><input type="checkbox" aria-label="授权读取当前学生本科历史" disabled={busy} checked={allowHistory} onChange={e => {
            if (!e.target.checked) { closeHistoryScope.current(); setImported(''); }
            setAllowHistory(e.target.checked);
          }} />允许模型通过工具按需读取该生该科的历史错题与知识点摘要（不自动发送全档案）</label>
          <label><input type="checkbox" aria-label="授权按需读取归档原图" disabled={busy || (!selectedAssignment && !allowHistory)} checked={allowOriginals} onChange={e => {
            if (!e.target.checked) { closeHistoryScope.current(); setImported(''); }
            setAllowOriginals(e.target.checked);
          }} />允许按需向当前模型提供归档图片的分析副本（合计最多3张；未授权历史时仅所选作业；请先确认原件已去标识）</label>
          <p>取消读取授权后，旧对话和已导入摘要不会随下一条消息重发；本地已保存笔记仍保留。</p>
          <label><input type="checkbox" aria-label="授权保存历史分析笔记" disabled={busy} checked={allowSave} onChange={e => setAllowSave(e.target.checked)} />允许保存为本地AI待确认笔记和MD，不改老师正式记录</label>
        </details> : null}
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
        {agentView ? <details className="agent-scope muted"><summary>本次材料范围与图片说明</summary>归档/普通查询仅本地。其他分析发送本次文字、最近10条非归档对话、最多3张所选图片{imported ? '及主动导入摘要' : ''}；勾选授权后可按需读取当前学生当前学科记录及原图。请先去标识。分析副本最长边2000像素，细小字迹需核对；原件不变，PDF未识别不外发。</details> : <p className="muted">本次发送：当前消息、最多3张所选图片、当前对话最近10条文字{imported ? '、主动导入的摘要' : ''}。发送前请自行遮去姓名、学校等身份信息；PDF仅保存在本地。</p>}
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
    <p className="muted agent-footnote">{agentView ? '模型在主窗口的“AI 服务设置”中设置。关闭或刷新会清空未保存对话。' : '右上方点击“打开 AI Agent”即可聊天。刷新页面会清空本次对话；已保存的摘要仍在本地档案。'}</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
