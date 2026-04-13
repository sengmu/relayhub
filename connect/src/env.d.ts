/// <reference types="vite/client" />

import type { ConnectApi } from './shared/contracts'

declare global {
  interface Window {
    connectApi: ConnectApi
  }
}

export {}
