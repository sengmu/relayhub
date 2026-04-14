import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AppConfig, ConnectionProfile } from '../src/shared/contracts.js'

function nowIso() {
  return new Date().toISOString()
}

function createDefaultProfile(): ConnectionProfile {
  const createdAt = nowIso()
  return {
    id: 'default',
    name: '默认配置',
    serverUrl: 'http://127.0.0.1:8080',
    listenHost: '127.0.0.1',
    listenPort: 3456,
    remoteBaseUrl: 'http://127.0.0.1:8080',
    createdAt,
    updatedAt: createdAt
  }
}

export const defaultConfig = (): AppConfig => {
  const profile = createDefaultProfile()
  return {
    serverProfile: {
      serverUrl: profile.serverUrl,
      email: ''
    },
    session: {
      serverUrl: profile.serverUrl
    },
    proxy: {
      listenHost: profile.listenHost,
      listenPort: profile.listenPort,
      remoteBaseUrl: profile.remoteBaseUrl
    },
    profiles: [profile],
    activeProfileId: profile.id
  }
}

function ensureProfiles(config: AppConfig): AppConfig {
  const now = nowIso()
  const profiles = Array.isArray(config.profiles) && config.profiles.length > 0 ? config.profiles : [createDefaultProfile()]
  const activeProfileId = config.activeProfileId || profiles[0].id
  const active = profiles.find((item) => item.id === activeProfileId) ?? profiles[0]
  const normalizedProfiles = profiles.map((profile) => ({
    ...profile,
    id: profile.id || randomUUID(),
    name: profile.name || '未命名配置',
    serverUrl: profile.serverUrl || active.serverUrl,
    listenHost: profile.listenHost || config.proxy?.listenHost || '127.0.0.1',
    listenPort: profile.listenPort || config.proxy?.listenPort || 3456,
    remoteBaseUrl: profile.remoteBaseUrl || profile.serverUrl || active.serverUrl,
    createdAt: profile.createdAt || now,
    updatedAt: profile.updatedAt || now
  }))

  return {
    ...defaultConfig(),
    ...config,
    serverProfile: { ...defaultConfig().serverProfile, ...(config.serverProfile || {}) },
    session: { ...defaultConfig().session, ...(config.session || {}) },
    proxy: { ...defaultConfig().proxy, ...(config.proxy || {}) },
    profiles: normalizedProfiles,
    activeProfileId: normalizedProfiles.some((item) => item.id === activeProfileId) ? activeProfileId : normalizedProfiles[0].id
  }
}

export function snapshotProfile(config: AppConfig, name?: string): ConnectionProfile {
  const now = nowIso()
  return {
    id: config.activeProfileId || 'default',
    name: name?.trim() || '当前配置',
    serverUrl: config.serverProfile.serverUrl,
    email: config.serverProfile.email || undefined,
    listenHost: config.proxy.listenHost,
    listenPort: config.proxy.listenPort,
    remoteBaseUrl: config.proxy.remoteBaseUrl,
    selectedApiKey: config.proxy.selectedApiKey,
    selectedApiKeyId: config.proxy.selectedApiKeyId,
    createdAt: now,
    updatedAt: now
  }
}

export function upsertProfile(config: AppConfig, profile: ConnectionProfile): AppConfig {
  const existingIndex = config.profiles.findIndex((item) => item.id === profile.id)
  const updatedProfiles = [...config.profiles]
  if (existingIndex >= 0) {
    updatedProfiles[existingIndex] = profile
  } else {
    updatedProfiles.push(profile)
  }
  return { ...config, profiles: updatedProfiles }
}

export function syncActiveProfile(config: AppConfig): AppConfig {
  const activeProfile = config.profiles.find((item) => item.id === config.activeProfileId)
  if (!activeProfile) return config
  const updatedProfile: ConnectionProfile = {
    ...activeProfile,
    name: activeProfile.name || '当前配置',
    serverUrl: config.serverProfile.serverUrl,
    email: config.serverProfile.email || undefined,
    listenHost: config.proxy.listenHost,
    listenPort: config.proxy.listenPort,
    remoteBaseUrl: config.proxy.remoteBaseUrl,
    selectedApiKey: config.proxy.selectedApiKey,
    selectedApiKeyId: config.proxy.selectedApiKeyId,
    updatedAt: nowIso()
  }
  return upsertProfile(config, updatedProfile)
}

const configPath = () => join(app.getPath('userData'), 'connect-config.json')

export async function loadConfig(): Promise<AppConfig> {
  const file = configPath()
  try {
    const raw = await readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    return ensureProfiles({
      ...defaultConfig(),
      ...parsed,
      serverProfile: { ...defaultConfig().serverProfile, ...(parsed.serverProfile || {}) },
      session: { ...defaultConfig().session, ...(parsed.session || {}) },
      proxy: { ...defaultConfig().proxy, ...(parsed.proxy || {}) },
      profiles: parsed.profiles || defaultConfig().profiles,
      activeProfileId: parsed.activeProfileId || defaultConfig().activeProfileId
    } as AppConfig)
  } catch {
    return defaultConfig()
  }
}

export async function saveConfig(config: AppConfig): Promise<AppConfig> {
  const file = configPath()
  await mkdir(dirname(file), { recursive: true })
  const normalized = ensureProfiles(config)
  await writeFile(file, JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}
