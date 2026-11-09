const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'http://127.0.0.1:5179';
app.setPath('userData', path.join(ROOT, '.local-data', 'electron-profile'));
app.setPath('crashDumps', path.join(ROOT, '.qa-temp', 'crashes'));
function openWindow(floating = false) {
  const win = new BrowserWindow({ width: floating ? 440 : 1060, height: floating ? 650 : 860,
    minWidth: 390, minHeight: 500, title: floating ? '晋学智辅 · 悬浮验证' : '晋学智辅2.0 · 环境验证',
    alwaysOnTop: floating, backgroundColor: '#f3f6f5',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== ORIGIN) event.preventDefault(); });
  win.loadURL(ORIGIN + (floating ? '/?floating=1' : '/'));
  return win;
}
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const local = ['127.0.0.1'].includes(url.hostname) && ['5179', '8019'].includes(url.port);
    callback({ cancel: !local && !['data:', 'blob:', 'devtools:'].includes(url.protocol) });
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '窗口', submenu: [{ label: '打开独立悬浮窗口', click: () => openWindow(true) }, { role: 'quit', label: '退出' }] },
  ]));
  const mainWindow = openWindow();
  if (process.argv.includes('--lifecycle-test')) {
    mainWindow.webContents.once('did-finish-load', () => setTimeout(() => mainWindow.close(), 2000));
  }
  if (process.argv.includes('--floating-test')) openWindow(true);
});
app.on('window-all-closed', () => app.quit());
