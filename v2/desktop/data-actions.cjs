const { dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

async function manageData(window, action, settingsFile, token) {
  if (!['backup', 'restore', 'select-data'].includes(action)) throw Error('不支持的操作');
  let backup;
  if (action === 'restore') {
    const selected = await dialog.showOpenDialog(window, { title: '选择本机备份ZIP', properties: ['openFile'], filters: [{ name: '备份', extensions: ['zip'] }] });
    if (selected.canceled) return {};
    backup = selected.filePaths[0];
  }
  const selected = await dialog.showOpenDialog(window, { title: action === 'backup' ? '选择备份文件夹' : action === 'restore' ? '选择恢复目标空文件夹' : '选择下次启动工作资料目录（不搬迁旧资料）', properties: ['openDirectory', 'createDirectory'] });
  if (selected.canceled) return {};
  const directory = selected.filePaths[0];
  if (action === 'select-data') {
    const entries = fs.readdirSync(directory);
    if (entries.length && !fs.existsSync(path.join(directory, 'intake.sqlite3')) && !fs.existsSync(path.join(directory, 'index.json'))) throw Error('请选择空目录或已有晋学智辅2.0资料目录');
    const choice = await dialog.showMessageBox(window, { type: 'question', buttons: ['取消', '下次启动使用此目录'], defaultId: 0, cancelId: 0,
      message: '切换工作资料目录', detail: `${directory}\n旧资料不会搬迁或删除。请先备份；完全退出后重新打开生效。` });
    if (choice.response !== 1) return {};
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    const temporary = settingsFile + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({ dataDirectory: directory }));
    fs.renameSync(temporary, settingsFile);
    return { notice: '下次启动将使用：' + directory + '。旧资料原地保留；请完全退出后重开。' };
  }
  const response = await fetch('http://127.0.0.1:8019/api/operations/' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jinxue-Local-Token': token || '' },
    body: JSON.stringify({ directory, backup }) });
  const data = await response.json();
  if (!response.ok) throw Error(typeof data.detail === 'string' ? data.detail : '备份或恢复失败');
  return { notice: action === 'backup' ? `已备份并校验：${data.path}；SHA-256 ${data.sha256}` : `已恢复并校验到：${data.path}。当前资料未切换。` };
}
module.exports = { manageData };
