import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerIpcHandlers } from './ipc.js'
import { updateManager } from './update-manager.js'

if (process.platform === 'linux') {
  // Electron 37 may crash the GPU process on some Ubuntu/Linux desktop setups,
  // which can take the whole app down during startup. Prefer a stable software
  // path over a hard crash.
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
}

if (process.platform === 'linux' && process.env.ELECTRON_DISABLE_SANDBOX === '1') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-setuid-sandbox')
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(app.getAppPath(), 'dist-electron/electron/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    const fileUrl = pathToFileURL(join(app.getAppPath(), 'dist/index.html')).toString()
    void window.loadURL(fileUrl)
  }
  return window
}

app.whenReady().then(() => {
  updateManager.initialize()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
