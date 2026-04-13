export interface ServerProfile {
  serverUrl: string
  email: string
  password?: string
}

export interface AuthenticatedUser {
  id: number
  username: string
  email: string
  role: 'admin' | 'user'
  balance: number
  concurrency: number
  status: 'active' | 'disabled'
  run_mode?: 'standard' | 'simple'
}

export interface SavedSession {
  serverUrl: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  user?: AuthenticatedUser
  requires2FA?: boolean
  tempToken?: string
  userEmailMasked?: string
}

export interface ApiKeyRecord {
  id: number
  key: string
  name: string
  status: 'active' | 'inactive' | 'quota_exhausted' | 'expired'
  group_id: number | null
  quota: number
  quota_used: number
  expires_at: string | null
  updated_at: string
}

export interface ProxySettings {
  listenHost: string
  listenPort: number
  remoteBaseUrl: string
  selectedApiKey?: string
  selectedApiKeyId?: number
}

export interface ProxyRuntimeState {
  running: boolean
  listenHost: string
  listenPort: number
  remoteBaseUrl?: string
  selectedApiKeyId?: number
  lastError?: string
}

export interface AppConfig {
  serverProfile: ServerProfile
  session: SavedSession
  proxy: ProxySettings
}

export interface PublicSettings {
  registration_enabled?: boolean
  email_verify_enabled?: boolean
  promo_code_enabled?: boolean
  invitation_code_enabled?: boolean
  totp_enabled?: boolean
  turnstile_enabled?: boolean
  turnstile_site_key?: string
  site_name?: string
  site_subtitle?: string
  api_base_url?: string
  version?: string
}

export interface LoginResult {
  session: SavedSession
  publicSettings?: PublicSettings
}

export interface RegisterInput {
  serverUrl: string
  email: string
  password: string
  verifyCode?: string
  promoCode?: string
  invitationCode?: string
  turnstileToken?: string
}

export interface UpdateDownloadProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error' | 'unsupported'
  currentVersion: string
  message: string
  checking: boolean
  downloading: boolean
  available: boolean
  canCheck: boolean
  canDownload: boolean
  canInstall: boolean
  latestVersion?: string
  downloadedVersion?: string
  releaseName?: string
  releaseDate?: string
  progress?: UpdateDownloadProgress
}

export interface ConnectApi {
  getConfig: () => Promise<AppConfig>
  saveServerProfile: (profile: ServerProfile) => Promise<AppConfig>
  getPublicSettings: (serverUrl: string) => Promise<PublicSettings>
  register: (input: RegisterInput) => Promise<LoginResult>
  login: (input: { serverUrl: string; email: string; password: string }) => Promise<LoginResult>
  completeLogin2FA: (input: { serverUrl: string; tempToken: string; code: string }) => Promise<LoginResult>
  listKeys: () => Promise<ApiKeyRecord[]>
  startProxy: (input?: Partial<ProxySettings>) => Promise<ProxyRuntimeState>
  stopProxy: () => Promise<ProxyRuntimeState>
  getProxyState: () => Promise<ProxyRuntimeState>
  getUpdateState: () => Promise<UpdateState>
  checkForUpdates: () => Promise<UpdateState>
  downloadUpdate: () => Promise<UpdateState>
  installUpdate: () => Promise<void>
  logout: () => Promise<AppConfig>
}
