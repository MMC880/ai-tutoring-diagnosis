const { app, BrowserWindow, Menu, session, ipcMain } = require('electron');
const path = require('node:path');
const { manageData } = require('./data-actions.cjs');
const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'http://127.0.0.1:5179';
app.setPath('userData', path.join(ROOT, '.local-data', 'electron-profile'));
app.setPath('crashDumps', path.join(ROOT, '.qa-temp', 'crashes'));
let mainWindow, agentWindow;
let agentContext = { subject: 'math', studentId: null };
function validContext(context) {
  if (!context || !['math', 'english', 'physics', 'chemistry'].includes(context.subject) ||
      (context.studentId != null && (typeof context.studentId !== 'string' || !/^s\d{3,12}$/.test(context.studentId)))) throw Error('学生或学科参数无效');
  return { subject: context.subject, studentId: context.studentId ?? null };
}
function trustedSender(event, window) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame) return false;
  try { return new URL(event.senderFrame.url).origin === ORIGIN; } catch { return false; }
}
function openAgent(context = { subject: 'math', studentId: null }) {
  const selected = validContext(context);
  if (agentWindow && !agentWindow.isDestroyed()) {
    if (agentWindow.isMinimized()) agentWindow.restore();
    agentWindow.show(); agentWindow.focus();
    return { opened: false };
  }
  agentContext = selected;
  agentWindow = openWindow(true);
  agentWindow.on('closed', () => { agentWindow = null; });
  return { opened: true };
}
function openWindow(floating = false) {
  const win = new BrowserWindow({ width: floating ? 540 : 1060, height: floating ? 780 : 860,
    minWidth: 390, minHeight: 600, title: floating ? '晋学智辅 · AI Agent' : '晋学智辅2.0 · 学习档案工作台',
    alwaysOnTop: floating, backgroundColor: '#f3f6f5',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, value) => {
    const url = new URL(value);
    const download = url.origin === 'http://127.0.0.1:8019' &&
      (/^\/api\/learning\/original\/[A-Za-z0-9_-]+\/[a-f0-9]{64}$/.test(url.pathname) ||
       /^\/api\/learning\/practice\/F-[a-f0-9]{32}$/.test(url.pathname));
    if (url.origin !== ORIGIN && !download) event.preventDefault();
  });
  win.loadURL(ORIGIN + (floating ? '/?floating=1' : '/'));
  return win;
}
app.whenReady().then(() => {
  ipcMain.handle('jinxue:manage-data', (event, action) => {
    if (!trustedSender(event, mainWindow)) throw Error('仅主窗口可管理本地资料');
    return manageData(mainWindow, action, path.join(ROOT, '.local-data', 'desktop-settings.json'), process.env.JINXUE_DESKTOP_TOKEN);
  });
  ipcMain.handle('jinxue:open-agent', (event, context) => {
    if (!trustedSender(event, mainWindow)) throw Error('仅主窗口可打开 AI Agent');
    return openAgent(context);
  });
  ipcMain.handle('jinxue:agent-context', event => {
    if (!trustedSender(event, agentWindow)) throw Error('仅 AI Agent 可读取本次选择');
    return agentContext;
  });
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const local = ['127.0.0.1'].includes(url.hostname) && ['5179', '8019'].includes(url.port);
    callback({ cancel: !local && !['data:', 'blob:', 'devtools:'].includes(url.protocol) });
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '窗口', submenu: [{ label: '打开 AI Agent', click: () => openAgent() }, { role: 'quit', label: '退出' }] },
  ]));
  mainWindow = openWindow();
  if (process.argv.includes('--lifecycle-test')) {
    mainWindow.webContents.once('did-finish-load', () => setTimeout(() => mainWindow.close(), 2000));
  }
  if (process.argv.includes('--floating-test')) openAgent();
});
app.on('window-all-closed', () => app.quit());
