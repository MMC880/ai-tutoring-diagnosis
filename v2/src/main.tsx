import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AssistantRuntimeProvider, useLocalRuntime, ThreadPrimitive, MessagePrimitive,
  ComposerPrimitive, SimpleImageAttachmentAdapter, type ChatModelAdapter } from '@assistant-ui/react';
import './style.css';

const API = 'http://127.0.0.1:8019';
const adapter: ChatModelAdapter = {
  async run({ messages, abortSignal }) {
    const last = messages.filter(m => m.role === 'user').at(-1);
    const text = last?.content.filter(p => p.type === 'text').map(p => p.text).join('\n') || '图片接收测试';
    const response = await fetch(`${API}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, image_count: last?.attachments?.length ?? 0 }), signal: abortSignal });
    if (!response.ok) throw new Error('本地服务请求失败，请检查后端');
    return { content: [{ type: 'text', text: (await response.json()).text }] };
  },
};

function Message() {
  return <MessagePrimitive.Root className="message"><MessagePrimitive.Parts /></MessagePrimitive.Root>;
}

function App() {
  const runtime = useLocalRuntime(adapter, { adapters: { attachments: new SimpleImageAttachmentAdapter() } });
  const [health, setHealth] = useState('连接中');
  const [skill, setSkill] = useState('读取中');
  const [previews, setPreviews] = useState<{ name: string; src: string }[]>([]);
  const [notice, setNotice] = useState('');
  useEffect(() => runtime.thread.composer.subscribe(() => {
    if (runtime.thread.composer.getState().attachments.length === 0) setPreviews([]);
  }), [runtime]);
  useEffect(() => {
    Promise.all([fetch(`${API}/health`).then(r => r.json()), fetch(`${API}/api/skill`).then(r => r.json())])
      .then(([h, s]) => { setHealth(h.status === 'ok' ? '后端已连接' : '连接失败'); setSkill(s.display_name || '读取失败'); })
      .catch(() => setHealth('连接失败，请启动本地服务'));
  }, []);

  async function addFiles(files: File[]) {
    setNotice('');
    try {
      if (files.length + runtime.thread.composer.getState().attachments.length > 3) throw new Error('环境测试最多3张图片');
      for (const file of files) {
        if (file.size > 2 * 1024 * 1024) throw new Error('环境测试图片不能超过2MB');
        const form = new FormData(); form.append('file', file);
        const result = await fetch(`${API}/api/images`, { method: 'POST', body: form });
        if (!result.ok) throw new Error((await result.json()).detail || '图片接收失败');
        await runtime.thread.composer.addAttachment(file);
        const src = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file);
        });
        setPreviews(old => [...old, { name: file.name, src }]);
        setNotice('图片接收成功，仅本地验证；未做识图');
      }
    } catch (e) { setNotice(e instanceof Error ? e.message : '图片处理失败'); }
  }

  return <main>
    <header><div><span className="eyebrow">晋学智辅 2.0</span><h1>开发环境验证台</h1></div><span className="badge" data-testid="health">{health}</span></header>
    <p className="muted">本地模拟 · 不读取学生资料 · 不连接外部模型。这是工具链验证界面，正式工作台尚未开发。</p>
    <section className="status"><span>中文教学技能：<strong data-testid="skill">{skill}</strong></span><a href="/copilot.html">打开 CopilotKit 独立实验</a></section>
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="thread">
        <ThreadPrimitive.Viewport className="messages"><ThreadPrimitive.Messages components={{ UserMessage: Message, AssistantMessage: Message }} /></ThreadPrimitive.Viewport>
        <section className="drop" data-testid="dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void addFiles(Array.from(e.dataTransfer.files)); }}>
          <label>拖入测试图片，或选择图片（最多3张，每张2MB）<input aria-label="添加测试图片" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} /></label>
          <div className="previews">{previews.map((p, i) => <figure key={i}><img alt={`测试图片：${p.name}`} src={p.src} /><figcaption>{p.name}</figcaption></figure>)}</div>
          <p role="status">{notice}</p>
        </section>
        <ComposerPrimitive.Root className="composer"><ComposerPrimitive.Input aria-label="消息" placeholder="输入一句测试消息" /><ComposerPrimitive.Send>发送</ComposerPrimitive.Send></ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
    <p className="muted">悬浮窗口可从桌面软件的“窗口”菜单打开。刷新页面会清空本次对话和图片。</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
