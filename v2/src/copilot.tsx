import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CopilotKitProvider, useAgent, useFrontendTool, useCopilotKit, HttpAgent } from '@copilotkit/react-core/v2';
import './style.css';

const agents = { default: new HttpAgent({ url: 'http://127.0.0.1:8019/api/copilot-agent' }) };
function Experiment() {
  const { agent, isReady } = useAgent({ agentId: 'default' });
  const { copilotkit } = useCopilotKit();
  const [status, setStatus] = useState('尚未执行');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  useFrontendTool({ name: 'updateDemoStatus', description: '更新环境测试卡片，不访问业务数据库', handler: async () => {
    setStatus('模拟工具已更新界面'); return { status: 'ok', synthetic: true };
  } }, []);
  async function run() {
    setRunning(true); setError('');
    try {
      agent.setMessages([{ id: crypto.randomUUID(), role: 'user', content: '请调用工具更新这张环境测试卡片' }]);
      await copilotkit.runAgent({ agent });
    } catch(e) { setError(String(e)); } finally { setRunning(false); }
  }
  return <main><span className="eyebrow">独立可行性实验</span><h1>CopilotKit → 界面工具</h1>
    <p>本地确定性 Agent 发送真实 AG-UI 工具事件，CopilotKit 注册并执行前端工具；不接模型、不操作学生资料。</p>
    <section className="status"><strong data-testid="copilot-status">{status}</strong><span data-testid="copilot-ready">{isReady ? 'Agent 已就绪' : '连接中'}</span></section>
    <button disabled={!isReady || running} onClick={() => void run()}>运行模拟 Agent</button><p role="alert">{error}</p><a href="/">返回 assistant-ui 验证台</a></main>;
}
createRoot(document.getElementById('root')!).render(<CopilotKitProvider selfManagedAgents={agents} enableInspector={false}><Experiment /></CopilotKitProvider>);
