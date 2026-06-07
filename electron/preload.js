const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // File system
  readNotebooks:   ()      => ipcRenderer.invoke('fs:read-notebooks'),
  savePage:        (args)  => ipcRenderer.invoke('fs:save-page', args),
  createPage:      (args)  => ipcRenderer.invoke('fs:create-page', args),
  createSection:   (args)  => ipcRenderer.invoke('fs:create-section', args),
  createNotebook:  (args)  => ipcRenderer.invoke('fs:create-notebook', args),
  rename:          (args)  => ipcRenderer.invoke('fs:rename', args),
  deletePage:      (args)  => ipcRenderer.invoke('fs:delete-page', args),
  deleteSection:   (args)  => ipcRenderer.invoke('fs:delete-section', args),
  deleteNotebook:  (args)  => ipcRenderer.invoke('fs:delete-notebook', args),
  chooseFolder:    ()      => ipcRenderer.invoke('fs:choose-folder'),

  // Settings store
  storeGet:        (key)         => ipcRenderer.invoke('store:get', key),
  storeSet:        (key, value)  => ipcRenderer.invoke('store:set', key, value),

  // Window controls
  minimize:        () => ipcRenderer.send('window:minimize'),
  maximize:        () => ipcRenderer.send('window:maximize'),
  close:           () => ipcRenderer.send('window:close'),

  // Menu events (main → renderer)
  onMenu:          (event, cb) => ipcRenderer.on(`menu:${event}`, cb),
  offMenu:         (event, cb) => ipcRenderer.off(`menu:${event}`, cb),
})
