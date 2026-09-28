const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orcaPet', {
  getInitialState: () => ipcRenderer.invoke('get-initial-state'),
  choosePet: () => ipcRenderer.invoke('choose-pet'),
  selectPet: (id) => ipcRenderer.invoke('select-pet', id),
  setScale: (scale) => ipcRenderer.invoke('set-scale', scale),
  setWander: (enabled) => ipcRenderer.invoke('set-wander', enabled),
  stopMotion: () => ipcRenderer.invoke('stop-motion'),
  beginDrag: (point) => ipcRenderer.send('drag-begin', point),
  moveDrag: (point) => ipcRenderer.send('drag-move', point),
  endDrag: () => ipcRenderer.send('drag-end'),
  setMenuOpen: (open) => ipcRenderer.invoke('set-menu-open', open),
  launchProjectPet: () => ipcRenderer.invoke('launch-project-pet'),
  installPet: () => ipcRenderer.invoke('install-pet'),
  quit: () => ipcRenderer.invoke('quit'),
  onStatus: (callback) => ipcRenderer.on('status', (_event, value) => callback(value)),
  onPet: (callback) => ipcRenderer.on('pet', (_event, value) => callback(value)),
  onMotion: (callback) => ipcRenderer.on('motion', (_event, value) => callback(value))
});
