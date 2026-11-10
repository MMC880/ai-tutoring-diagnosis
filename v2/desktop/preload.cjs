const { contextBridge, ipcRenderer } = require('electron');

// Fixed operations only. No arbitrary IPC, filesystem, process or credential access.
contextBridge.exposeInMainWorld('jinxueDesktop', {
  openAgent: context => ipcRenderer.invoke('jinxue:open-agent', context),
  manageData: action => ipcRenderer.invoke('jinxue:manage-data', action),
  getAgentContext: () => ipcRenderer.invoke('jinxue:agent-context'),
});
