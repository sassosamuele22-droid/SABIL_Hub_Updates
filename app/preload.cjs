const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sabilUpdater', {
  check: () => ipcRenderer.invoke('updater:check'),
  download: () => ipcRenderer.invoke('updater:download'),
  install: () => ipcRenderer.send('updater:install'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPort: () => ipcRenderer.invoke('app:port'),
  onStatus: (cb) => ipcRenderer.on('updater:status', (_e, payload) => cb(payload))
});

contextBridge.exposeInMainWorld('sabilDesktop', {
  notify: (payload) => ipcRenderer.invoke('desktop:notify', payload),
  saveFile: (payload) => ipcRenderer.invoke('desktop:saveFile', payload),
  hide: () => ipcRenderer.invoke('desktop:hide'),
  quit: () => ipcRenderer.invoke('desktop:quit')
});
