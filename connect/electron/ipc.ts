import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { loadConfig, saveConfig, snapshotProfile, syncActiveProfile, defaultConfig } from './config.js'
import { completeLogin2FA, getCurrentUser, getPublicSettings, listKeys, login, register } from './sub2api-client.js'
import { createLocalProxy } from './local-proxy.js'
import { updateManager } from './update-manager.js'
import type { AppConfig, ProxySettings, RegisterInput, ServerProfile } from '../src/shared/contracts.js'

const proxy = createLocalProxy()

function normalizeServerUrl(serverUrl: string): string {
  return serverUrl.trim().replace(/\/$/, '')
}

async function persistConfig(config: AppConfig): Promise<AppConfig> {
  return saveConfig(syncActiveProfile(config))
}

export function registerIpcHandlers(): void {
  ipcMain.handle('connect:get-config', async () => {
    return loadConfig()
  })

  ipcMain.handle('connect:save-server-profile', async (_event, profile: ServerProfile) => {
    const config = await loadConfig()
    config.serverProfile = { ...config.serverProfile, ...profile }
    config.session.serverUrl = normalizeServerUrl(profile.serverUrl)
    config.proxy.remoteBaseUrl = normalizeServerUrl(profile.serverUrl)
    return persistConfig(config)
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
    config.proxy.remoteBaseUrl = normalizeServerUrl(input.serverUrl)
    if (session.accessToken) {
      config.session.user = await getCurrentUser(input.serverUrl, session.accessToken)
    }
    await persistConfig(config)
    return { session: config.session, publicSettings }
  })

  ipcMain.handle('connect:login', async (_event, input: { serverUrl: string; email: string; password: string }) => {
    const config = await loadConfig()
    const session = await login(input.serverUrl, input.email, input.password)
    const publicSettings = await getPublicSettings(input.serverUrl)
    config.serverProfile = { serverUrl: input.serverUrl, email: input.email }
    config.session = session
    config.proxy.remoteBaseUrl = normalizeServerUrl(input.serverUrl)
    if (session.accessToken) {
      config.session.user = await getCurrentUser(input.serverUrl, session.accessToken)
    }
    await persistConfig(config)
    return { session: config.session, publicSettings }
  })

  ipcMain.handle('connect:login-2fa', async (_event, input: { serverUrl: string; tempToken: string; code: string }) => {
    const config = await loadConfig()
    const session = await completeLogin2FA(input.serverUrl, input.tempToken, input.code)
    const publicSettings = await getPublicSettings(input.serverUrl)
    config.session = session
    config.proxy.remoteBaseUrl = normalizeServerUrl(input.serverUrl)
    if (session.accessToken) {
      config.session.user = await getCurrentUser(input.serverUrl, session.accessToken)
    }
    await persistConfig(config)
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
      await persistConfig(config)
    }
    return keys
  })

  ipcMain.handle('connect:create-profile', async (_event, input: { name: string }) => {
    const config = await loadConfig()
    const snapshot = snapshotProfile(config, input.name)
    const profile = {
      ...snapshot,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    config.profiles = [...config.profiles, profile]
    config.activeProfileId = profile.id
    await persistConfig(config)
    return config
  })

  ipcMain.handle('connect:activate-profile', async (_event, profileId: string) => {
    const config = await loadConfig()
    const profile = config.profiles.find((item) => item.id === profileId)
    if (!profile) {
      throw new Error('配置集不存在。')
    }
    const wasRunning = proxy.state().running
    if (wasRunning) {
      await proxy.stop()
    }
    config.activeProfileId = profile.id
    config.serverProfile = {
      serverUrl: profile.serverUrl,
      email: profile.email || ''
    }
    config.session.serverUrl = profile.serverUrl
    config.proxy = {
      ...config.proxy,
      listenHost: profile.listenHost,
      listenPort: profile.listenPort,
      remoteBaseUrl: profile.remoteBaseUrl,
      selectedApiKey: profile.selectedApiKey,
      selectedApiKeyId: profile.selectedApiKeyId
    }
    await persistConfig(config)
    if (wasRunning && config.proxy.selectedApiKey) {
      await proxy.start(config.proxy)
    }
    return config
  })

  ipcMain.handle('connect:delete-profile', async (_event, profileId: string) => {
    const config = await loadConfig()
    const filtered = config.profiles.filter((item) => item.id !== profileId)
    config.profiles = filtered.length > 0 ? filtered : [defaultConfig().profiles[0]]
    if (config.activeProfileId === profileId) {
      config.activeProfileId = config.profiles[0].id
      const fallback = config.profiles[0]
      config.serverProfile = {
        serverUrl: fallback.serverUrl,
        email: fallback.email || ''
      }
      config.session.serverUrl = fallback.serverUrl
      config.proxy = {
        ...config.proxy,
        listenHost: fallback.listenHost,
        listenPort: fallback.listenPort,
        remoteBaseUrl: fallback.remoteBaseUrl,
        selectedApiKey: fallback.selectedApiKey,
        selectedApiKeyId: fallback.selectedApiKeyId
      }
      if (proxy.state().running) {
        await proxy.stop()
        if (config.proxy.selectedApiKey) {
          await proxy.start(config.proxy)
        }
      }
    }
    return persistConfig(config)
  })

  ipcMain.handle('connect:start-proxy', async (_event, partial?: Partial<ProxySettings>) => {
    const config = await loadConfig()
    config.proxy = { ...config.proxy, ...(partial || {}) }
    if (!config.proxy.selectedApiKey) {
      throw new Error('请先选择一个可用的 API Key，再启动本地代理。')
    }
    const state = await proxy.start(config.proxy)
    await persistConfig(config)
    return state
  })

  ipcMain.handle('connect:stop-proxy', async () => {
    const state = await proxy.stop()
    const config = await loadConfig()
    await persistConfig(config)
    return state
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
    return persistConfig(config)
  })
}
