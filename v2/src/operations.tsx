import { useEffect, useState } from 'react';
import { api } from './learning';

export function OperationsPanel() {
  const [directory, setDirectory] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void api('/api/operations').then(r => setDirectory(r.data_directory)).catch(e => setNotice(e.message)); }, []);
  async function run(action: 'backup' | 'restore' | 'select-data') {
    if (!window.jinxueDesktop) { setNotice('请在Windows桌面窗口中选择目录'); return; }
    setBusy(true);
    try { const result = await window.jinxueDesktop.manageData(action); setNotice(result.notice || '已取消，未修改资料'); }
    catch (error) { setNotice(error instanceof Error ? error.message : '本地操作失败'); }
    finally { setBusy(false); }
  }
  return <details className="provider"><summary>本地资料与备份</summary>
    <p>当前工作资料目录（不是备份目录）：<strong data-testid="data-directory">{directory}</strong></p>
    <p className="muted">备份文件使用英文名称 backup-*.zip。恢复仅到空目录；切换工作目录不自动搬迁旧资料。</p>
    <div className="actions"><button disabled={busy} onClick={() => void run('backup')}>选择文件夹并备份</button><button disabled={busy} onClick={() => void run('restore')}>校验备份并恢复到空目录</button><button disabled={busy} onClick={() => void run('select-data')}>选择下次启动资料目录</button></div>
    <p role="status" data-testid="operations-result">{notice}</p></details>;
}
