import { contextBridge } from 'electron'

// Expose safe APIs to the renderer (web app) via window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
})
