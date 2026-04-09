const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ticker', {
  onHeadlinesUpdate: (cb) => ipcRenderer.on('headlines-update', (_, data) => cb(data)),
  onSettingsUpdated: (cb) => ipcRenderer.on('settings-updated', (_, data) => cb(data)),
  openLink: (url) => ipcRenderer.send('open-link', url),
  headlineSeen: (guid) => ipcRenderer.send('headline-seen', guid),
  minimize: () => ipcRenderer.send('win-minimize'),
  close: () => ipcRenderer.send('win-close'),
  saveSettings: (s) => ipcRenderer.send('save-settings', s),
  getSettings: () => ipcRenderer.invoke('get-settings')
});
