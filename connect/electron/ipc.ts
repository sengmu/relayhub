import { ipcMain } from 'electron'
import { loadConfig, saveConfig } from './config.js'
import { completeLogin2FA, getCurrentUser, getPublicSettings, listKeys, login, register } from './sub2api-client.js'
import { createLocalProxy } from './local-proxy.js'
import { updateManager } from './update-manager.js'
import type { ProxySettings, RegisterInput, ServerProfile } from '../src/shared/contracts.js'

const proxy = createLocalProxy()

export function registerIpcHandlers(): void {
  ipcMain.handle('connect:get-config', async () => {
    return loadConfig()
  })

  ipcMain.handle('connect:save-server-profile', async (_event, profile: ServerProfile) => {
    const config = await loadConfig()
    config.serverProfile = { ...config.serverProfile, ...profile }
    config.session.serverUrl = profile.serverUrl
    config.proxy.remoteBaseUrl = profile.serverUrl.trim().replace(/\/$/, '')
    return saveConfig(config)
  })

  ipcMain.handle('connect:get-public-settings', async (_event, serverUrl: string) => {
    return getPublicSettings(serverUrl)
  })

  ipcMain.handle('connect:register', async (_event, input: RegisterInput) => {
    const config = await loadConfig()
    const session = await register(input)
    const publicSettings = await getPublicSettings(input.serverUrl)
    config.serverProfile = { serverUrl: input.serverUrl, email: input.email }
    config.session = session
    config.proxy.remoteBaseUrl = input.serverUrl.trim().replace(/\/$/, '')
    if (session.accessToken) {
      config.session.user = await getCurrentUser(input.serverUrl, session.accessToken)
    }
    await saveConfig(config)
    return { session: config.session, publicSettings }
  })

  ipcMain.handle('connect:login', async (_event, input: { serverUrl: string; email: string; password: string }) => {
    const config = await loadConfig()
    const session = await login(input.serverUrl, input.email, input.password)
    const publicSettings = await getPublicSettings(input.serverUrl)
    config.serverProfile = { serverUrl: input.serverUrl, email: input.email }
    config.session = session
    config.proxy.remoteBaseUrl = input.serverUrl.trim().replace(/\/$/, '')
    if (session.accessToken) {
      config.session.user = await getCurrentUser(input.serverUrl, session.accessToken)
    }
    await saveConfig(config)
    return { session: config.session, publicSettings }
  })

  ipcMain.handle('connect:login-2fa', async (_event, input: { serverUrl: string; tempToken: string; code: string }) => {
    const config = await loadConfig()
    const session = await completeLogin2FA(input.serverUrl, input.tempToken, input.code)
    const publicSettings = await getPublicSettings(input.serverUrl)
    config.session = session
    config.proxy.remoteBaseUrl = input.serverUrl.trim().replace(/\/$/, '')
    if (session.accessToken) {
      config.session.user = await getCurrentUser(input.serverUrl, session.accessToken)
    }
    await saveConfig(config)
    return { session: config.session, publicSettings }
  })

  ipcMain.handle('connect:list-keys', async () => {
    const config = await loadConfig()
    if (!config.session.accessToken) {
      throw new Error('请先登录，再拉取 API Key。')
    }
    const keys = await listKeys(config.session.serverUrl || config.serverProfile.serverUrl, config.session.accessToken)
    const active = keys.find((item) => item.status === 'active')
    if (active) {
      config.proxy.selectedApiKey = active.key
      config.proxy.selectedApiKeyId = active.id
      await saveConfig(config)
    }
    return keys
  })

  ipcMain.handle('connect:start-proxy', async (_event, partial?: Partial<ProxySettings>) => {
    const config = await loadConfig()
    config.proxy = { ...config.proxy, ...(partial || {}) }
    if (!config.proxy.selectedApiKey) {
      throw new Error('请先选择一个可用的 API Key，再启动本地代理。')
    }
    const state = await proxy.start(config.proxy)
    await saveConfig(config)
    return state
  })

  ipcMain.handle('connect:stop-proxy', async () => {
    return proxy.stop()
  })

  ipcMain.handle('connect:get-proxy-state', async () => {
    return proxy.state()
  })

  ipcMain.handle('connect:get-update-state', async () => {
    return updateManager.getState()
  })

  ipcMain.handle('connect:check-for-updates', async () => {
    return updateManager.checkForUpdates()
  })

  ipcMain.handle('connect:download-update', async () => {
    return updateManager.downloadUpdate()
  })

  ipcMain.handle('connect:install-update', async () => {
    await updateManager.installUpdate()
  })

  ipcMain.handle('connect:logout', async () => {
    const config = await loadConfig()
    config.session = { serverUrl: config.serverProfile.serverUrl }
    config.proxy.selectedApiKey = undefined
    config.proxy.selectedApiKeyId = undefined
    await proxy.stop()
    return saveConfig(config)
  })
}
