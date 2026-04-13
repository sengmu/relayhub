import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { ProxyRuntimeState, ProxySettings } from '../src/shared/contracts.js'

interface ProxyController {
  start(settings: ProxySettings): Promise<ProxyRuntimeState>
  stop(): Promise<ProxyRuntimeState>
  state(): ProxyRuntimeState
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return undefined
  return Buffer.concat(chunks)
}

function filterHeaders(input: IncomingMessage['headers']): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!value || key.toLowerCase() === 'host' || key.toLowerCase() === 'content-length') continue
    out[key] = Array.isArray(value) ? value.join(', ') : value
  }
  return out
}

export function createLocalProxy(): ProxyController {
  let server: Server | null = null
  let runtime: ProxyRuntimeState = {
    running: false,
    listenHost: '127.0.0.1',
    listenPort: 3456
  }
  let currentSettings: ProxySettings | null = null

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = req.url || '/'
    if (path === '/health' || path === '/ready') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ok: runtime.running,
        ...runtime
      }))
      return
    }

    if (!currentSettings) {
      runtime.lastError = '代理尚未完成初始化。'
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: runtime.lastError }))
      return
    }

    try {
      const targetUrl = new URL(path, currentSettings.remoteBaseUrl)
      const body = await readBody(req)
      const headers = filterHeaders(req.headers)
      if (!headers.authorization && currentSettings.selectedApiKey) {
        headers.authorization = `Bearer ${currentSettings.selectedApiKey}`
      }

          const upstream = await fetch(targetUrl, {
            method: req.method,
            headers,
            body: body && !['GET', 'HEAD'].includes(req.method || 'GET') ? new Uint8Array(body) : undefined
          })

      const responseBuffer = Buffer.from(await upstream.arrayBuffer())
      const responseHeaders: Record<string, string> = {}
      upstream.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })
      res.writeHead(upstream.status, responseHeaders)
      res.end(responseBuffer)
      runtime.lastError = undefined
    } catch (error) {
      runtime.lastError = error instanceof Error ? error.message : '代理转发失败'
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: runtime.lastError }))
    }
  }

  return {
    async start(settings: ProxySettings): Promise<ProxyRuntimeState> {
      currentSettings = settings
      if (server) {
        runtime = {
          running: true,
          listenHost: settings.listenHost,
          listenPort: settings.listenPort,
          remoteBaseUrl: settings.remoteBaseUrl,
          selectedApiKeyId: settings.selectedApiKeyId,
          lastError: runtime.lastError
        }
        return runtime
      }

      await new Promise<void>((resolve, reject) => {
        server = createServer((req, res) => {
          handle(req, res).catch((error) => {
            runtime.lastError = error instanceof Error ? error.message : '代理内部错误'
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: runtime.lastError }))
          })
        })
        server.once('error', reject)
        server.listen(settings.listenPort, settings.listenHost, () => resolve())
      })

      runtime = {
        running: true,
        listenHost: settings.listenHost,
        listenPort: settings.listenPort,
        remoteBaseUrl: settings.remoteBaseUrl,
        selectedApiKeyId: settings.selectedApiKeyId
      }
      return runtime
    },
    async stop(): Promise<ProxyRuntimeState> {
      if (!server) {
        runtime = { ...runtime, running: false }
        return runtime
      }
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
      server = null
      runtime = { ...runtime, running: false }
      return runtime
    },
    state(): ProxyRuntimeState {
      return runtime
    }
  }
}
