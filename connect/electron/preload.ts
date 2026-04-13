import { contextBridge, ipcRenderer } from 'electron'
import type { ConnectApi } from '../src/shared/contracts.js'

const api: ConnectApi = {
  getConfig: () => ipcRenderer.invoke('connect:get-config'),
  saveServerProfile: (profile) => ipcRenderer.invoke('connect:save-server-profile', profile),
  getPublicSettings: (serverUrl) => ipcRenderer.invoke('connect:get-public-settings', serverUrl),
  register: (input) => ipcRenderer.invoke('connect:register', input),
  login: (input) => ipcRenderer.invoke('connect:login', input),
  completeLogin2FA: (input) => ipcRenderer.invoke('connect:login-2fa', input),
  listKeys: () => ipcRenderer.invoke('connect:list-keys'),
  startProxy: (input) => ipcRenderer.invoke('connect:start-proxy', input),
  stopProxy: () => ipcRenderer.invoke('connect:stop-proxy'),
  getProxyState: () => ipcRenderer.invoke('connect:get-proxy-state'),
  getUpdateState: () => ipcRenderer.invoke('connect:get-update-state'),
  checkForUpdates: () => ipcRenderer.invoke('connect:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('connect:download-update'),
  installUpdate: () => ipcRenderer.invoke('connect:install-update'),
  logout: () => ipcRenderer.invoke('connect:logout')
}

contextBridge.exposeInMainWorld('connectApi', api)
