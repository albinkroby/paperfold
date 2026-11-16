const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // File system
  readNotebooks:   ()      => ipcRenderer.invoke('fs:read-notebooks'),
  readPage:        (args)  => ipcRenderer.invoke('fs:read-page', args),
  savePage:        (args)  => ipcRenderer.invoke('fs:save-page', args),
  exportMd:        (args)  => ipcRenderer.invoke('fs:export-md', args),
  createPage:      (args)  => ipcRenderer.invoke('fs:create-page', args),
  createSection:   (args)  => ipcRenderer.invoke('fs:create-section', args),
  createNotebook:  (args)  => ipcRenderer.invoke('fs:create-notebook', args),
  rename:          (args)  => ipcRenderer.invoke('fs:rename', args),
  deletePage:      (args)  => ipcRenderer.invoke('fs:delete-page', args),
  deleteSection:   (args)  => ipcRenderer.invoke('fs:delete-section', args),
  deleteNotebook:  (args)  => ipcRenderer.invoke('fs:delete-notebook', args),
  search:          (args)  => ipcRenderer.invoke('fs:search', args),
  chooseFolder:    ()      => ipcRenderer.invoke('fs:choose-folder'),

  // Settings store
  storeGet:        (key)         => ipcRenderer.invoke('store:get', key),
  storeSet:        (key, value)  => ipcRenderer.invoke('store:set', key, value),

  // App info
  getVersion:      ()      => ipcRenderer.invoke('app:get-version'),

  // Window controls
  minimize:        () => ipcRenderer.send('window:minimize'),
  maximize:        () => ipcRenderer.send('window:maximize'),
  close:           () => ipcRenderer.send('window:close'),
  // Tell main that unsaved edits were flushed (ok=false keeps the window open)
  closeReady:      (ok) => ipcRenderer.send('app:close-ready', ok),
  relaunch:        () => ipcRenderer.send('app:relaunch'),

  // Menu events (main → renderer): save, new-page, search, open-folder,
  // export-md, before-close, quick-open, fs-changed
  onMenu:          (event, cb) => ipcRenderer.on(`menu:${event}`, cb),
  offMenu:         (event, cb) => ipcRenderer.off(`menu:${event}`, cb),
})
