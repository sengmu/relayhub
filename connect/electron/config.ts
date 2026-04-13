import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AppConfig } from '../src/shared/contracts.js'

const defaultConfig = (): AppConfig => ({
  serverProfile: {
    serverUrl: 'http://127.0.0.1:8080',
    email: ''
  },
  session: {
    serverUrl: 'http://127.0.0.1:8080'
  },
  proxy: {
    listenHost: '127.0.0.1',
    listenPort: 3456,
    remoteBaseUrl: 'http://127.0.0.1:8080'
  }
})

const configPath = () => join(app.getPath('userData'), 'connect-config.json')

export async function loadConfig(): Promise<AppConfig> {
  const file = configPath()
  try {
    const raw = await readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    return {
      ...defaultConfig(),
      ...parsed,
      serverProfile: { ...defaultConfig().serverProfile, ...(parsed.serverProfile || {}) },
      session: { ...defaultConfig().session, ...(parsed.session || {}) },
      proxy: { ...defaultConfig().proxy, ...(parsed.proxy || {}) }
    }
  } catch {
    return defaultConfig()
  }
}

export async function saveConfig(config: AppConfig): Promise<AppConfig> {
  const file = configPath()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(config, null, 2), 'utf8')
  return config
}
