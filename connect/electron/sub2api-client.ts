import type { ApiKeyRecord, AuthenticatedUser, PublicSettings, RegisterInput, SavedSession } from '../src/shared/contracts.js'

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

interface AuthResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
  user: AuthenticatedUser
}

interface TotpLoginResponse {
  requires_2fa: boolean
  temp_token?: string
  user_email_masked?: string
}

function normalizeServerUrl(serverUrl: string): string {
  return serverUrl.trim().replace(/\/$/, '')
}

function apiUrl(serverUrl: string, path: string): string {
  return `${normalizeServerUrl(serverUrl)}/api/v1${path}`
}

function toFriendlyError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  return new Error('发生未知错误，请稍后重试。')
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {})
      }
    })
    const isJson = response.headers.get('content-type')?.includes('application/json')
    const payload = isJson ? (await response.json()) as ApiEnvelope<T> | Record<string, unknown> : null

    if (!response.ok) {
      const message = typeof payload === 'object' && payload && 'message' in payload
        ? String(payload.message)
        : response.status === 401
          ? '登录已失效，请重新登录。'
          : response.status === 429
            ? '请求过于频繁，请稍后再试。'
            : response.status >= 500
              ? '服务端暂时不可用，请稍后再试。'
              : `请求失败（HTTP ${response.status}）`
      throw new Error(message)
    }

    if (payload && 'code' in payload) {
      const wrapped = payload as ApiEnvelope<T>
      if (wrapped.code !== 0) {
        throw new Error(wrapped.message || '请求失败')
      }
      return wrapped.data
    }

    return payload as T
  } catch (error) {
    if (error instanceof Error && /fetch failed|network/i.test(error.message)) {
      throw new Error('无法连接到 sub2api 服务器，请检查地址与网络。')
    }
    throw toFriendlyError(error)
  }
}

export async function getPublicSettings(serverUrl: string): Promise<PublicSettings> {
  return request<PublicSettings>(apiUrl(serverUrl, '/settings/public'), { method: 'GET' })
}

export async function register(input: RegisterInput): Promise<SavedSession> {
  const data = await request<AuthResponse>(apiUrl(input.serverUrl, '/auth/register'), {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      verify_code: input.verifyCode,
      promo_code: input.promoCode,
      invitation_code: input.invitationCode,
      turnstile_token: input.turnstileToken
    })
  })

  return {
    serverUrl: normalizeServerUrl(input.serverUrl),
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    user: data.user
  }
}

export async function login(serverUrl: string, email: string, password: string): Promise<SavedSession> {
  const data = await request<AuthResponse | TotpLoginResponse>(apiUrl(serverUrl, '/auth/login'), {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })

  if ('requires_2fa' in data && data.requires_2fa) {
    return {
      serverUrl: normalizeServerUrl(serverUrl),
      requires2FA: true,
      tempToken: data.temp_token,
      userEmailMasked: data.user_email_masked
    }
  }

  if (!('access_token' in data)) {
    throw new Error('登录响应缺少访问令牌，请检查服务端版本是否兼容。')
  }

  return {
    serverUrl: normalizeServerUrl(serverUrl),
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    user: data.user
  }
}

export async function completeLogin2FA(serverUrl: string, tempToken: string, code: string): Promise<SavedSession> {
  const data = await request<AuthResponse>(apiUrl(serverUrl, '/auth/login/2fa'), {
    method: 'POST',
    body: JSON.stringify({ temp_token: tempToken, totp_code: code })
  })

  return {
    serverUrl: normalizeServerUrl(serverUrl),
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    user: data.user
  }
}

export async function getCurrentUser(serverUrl: string, accessToken: string): Promise<AuthenticatedUser> {
  return request<AuthenticatedUser>(apiUrl(serverUrl, '/auth/me'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })
}

export async function listKeys(serverUrl: string, accessToken: string): Promise<ApiKeyRecord[]> {
  const data = await request<{ items: ApiKeyRecord[] }>(apiUrl(serverUrl, '/keys?page=1&page_size=100'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })
  return data.items || []
}
