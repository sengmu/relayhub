import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { AppUpdater, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'
import type { ProgressInfo } from 'builder-util-runtime'
import type { UpdateState } from '../src/shared/contracts.js'

function isoOrUndefined(value?: string | Date | null): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  return value.toISOString()
}

class UpdateManager {
  private readonly updater: AppUpdater
  private initialized = false
  private state: UpdateState = {
    status: 'idle',
    currentVersion: app.getVersion(),
    message: '尚未检查更新。',
    checking: false,
    downloading: false,
    available: false,
    canCheck: false,
    canDownload: false,
    canInstall: false
  }

  constructor() {
    this.updater = autoUpdater
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = true
  }

  initialize(): void {
    if (this.initialized) return
    this.initialized = true

    if (!app.isPackaged) {
      this.state = {
        ...this.state,
        status: 'unsupported',
        currentVersion: app.getVersion(),
        message: '当前是开发模式，自动更新仅在已打包安装后的应用中可用。',
        canCheck: false,
        canDownload: false,
        canInstall: false
      }
      return
    }

    this.state = {
      ...this.state,
      currentVersion: app.getVersion(),
      message: '可以检查更新。',
      status: 'idle',
      canCheck: true,
      canDownload: false,
      canInstall: false
    }

    this.updater.on('checking-for-update', () => {
      this.state = {
        ...this.state,
        status: 'checking',
        message: '正在检查更新…',
        checking: true,
        downloading: false,
        canCheck: false,
        canDownload: false,
        canInstall: false,
        progress: undefined
      }
    })

    this.updater.on('update-available', (info: UpdateInfo) => {
      this.state = {
        ...this.state,
        status: 'available',
        message: `发现新版本 ${info.version}，可以开始下载。`,
        checking: false,
        downloading: false,
        available: true,
        canCheck: true,
        canDownload: true,
        canInstall: false,
        latestVersion: info.version,
        releaseName: info.releaseName || undefined,
        releaseDate: isoOrUndefined(info.releaseDate),
        progress: undefined
      }
    })

    this.updater.on('update-not-available', (info: UpdateInfo) => {
      this.state = {
        ...this.state,
        status: 'up-to-date',
        message: '当前已经是最新版本。',
        checking: false,
        downloading: false,
        available: false,
        canCheck: true,
        canDownload: false,
        canInstall: false,
        latestVersion: info.version,
        downloadedVersion: undefined,
        progress: undefined
      }
    })

    this.updater.on('download-progress', (progress: ProgressInfo) => {
      this.state = {
        ...this.state,
        status: 'downloading',
        message: `正在下载更新 ${progress.percent.toFixed(1)}%`,
        checking: false,
        downloading: true,
        available: true,
        canCheck: false,
        canDownload: false,
        canInstall: false,
        progress: {
          percent: progress.percent,
          bytesPerSecond: progress.bytesPerSecond,
          transferred: progress.transferred,
          total: progress.total
        }
      }
    })

    this.updater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
      this.state = {
        ...this.state,
        status: 'downloaded',
        message: `更新 ${event.version} 已下载完成，点击“重启安装”即可生效。`,
        checking: false,
        downloading: false,
        available: true,
        canCheck: true,
        canDownload: false,
        canInstall: true,
        latestVersion: event.version,
        downloadedVersion: event.version,
        releaseName: event.releaseName || undefined,
        releaseDate: isoOrUndefined(event.releaseDate),
        progress: {
          percent: 100,
          bytesPerSecond: 0,
          transferred: 0,
          total: 0
        }
      }
    })

    this.updater.on('error', (error: Error) => {
      this.state = {
        ...this.state,
        status: 'error',
        message: error.message || '自动更新失败。',
        checking: false,
        downloading: false,
        canCheck: true,
        canDownload: this.state.available && !this.state.canInstall,
        progress: undefined
      }
    })
  }

  getState(): UpdateState {
    return { ...this.state }
  }

  async checkForUpdates(): Promise<UpdateState> {
    this.initialize()
    if (!app.isPackaged) {
      return this.getState()
    }
    await this.updater.checkForUpdates()
    return this.getState()
  }

  async downloadUpdate(): Promise<UpdateState> {
    this.initialize()
    if (!app.isPackaged) {
      return this.getState()
    }
    if (!this.state.available) {
      throw new Error('当前没有可下载的更新，请先检查更新。')
    }
    await this.updater.downloadUpdate()
    return this.getState()
  }

  async installUpdate(): Promise<void> {
    this.initialize()
    if (!app.isPackaged) {
      throw new Error('开发模式下不能执行自动更新安装。')
    }
    if (!this.state.canInstall) {
      throw new Error('更新尚未下载完成，暂时不能安装。')
    }
    this.updater.quitAndInstall(false, true)
  }
}

export const updateManager = new UpdateManager()
