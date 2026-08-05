import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

// Fallback mock API for standalone browser tab preview (when not inside Electron)
if (typeof window !== 'undefined' && !window.api) {
  window.api = {
    storeGet: async () => null,
    storeSet: async () => {},
    getVersion: async () => '1.0.0 (Browser)',
    readNotebooks: async () => ({
      rootDir: 'Browser Preview',
      notebooks: [
        {
          name: 'My Notebook',
          path: '/preview/notebook',
          sections: [
            {
              name: 'Section 1',
              path: '/preview/notebook/sec1',
              pages: [
                { title: 'Tasklist Demo', path: '/preview/notebook/sec1/tasklist.md' },
              ]
            }
          ]
        }
      ]
    }),
    readPage: async () => ({ content: '# Tasklist Demo\n\n- [ ] Uncompleted task item\n- [x] Completed task item' }),
    savePage: async () => {},
    chooseFolder: async () => null,
    exportMd: async () => {},
    createNotebook: async () => {},
    createSection: async () => {},
    createPage: async () => null,
    rename: async () => {},
    deleteNotebook: async () => {},
    deleteSection: async () => {},
    deletePage: async () => {},
    minimize: () => {},
    maximize: () => {},
    close: () => {},
    onMenu: () => {},
    offMenu: () => {},
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

