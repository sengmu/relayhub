<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ApiKeyRecord, AppConfig, ConnectionProfile, ProxyRuntimeState, PublicSettings, UpdateState } from './shared/contracts'

type SectionKey = 'overview' | 'profiles' | 'account' | 'billing' | 'keys' | 'templates' | 'diagnostics' | 'updates'

const config = ref<AppConfig | null>(null)
const publicSettings = ref<PublicSettings | null>(null)
const apiKeys = ref<ApiKeyRecord[]>([])
const proxyState = ref<ProxyRuntimeState | null>(null)
const updateState = ref<UpdateState | null>(null)
const serverUrl = ref('http://127.0.0.1:8080')
const email = ref('')
const password = ref('')
const registerVerifyCode = ref('')
const registerPromoCode = ref('')
const registerInvitationCode = ref('')
const totpCode = ref('')
const profileName = ref('当前配置')
const statusMessage = ref('准备就绪')
const busy = ref(false)
const currentSection = ref<SectionKey>('overview')
let updatePollTimer: number | null = null

const navItems: Array<{ key: SectionKey; label: string; hint: string }> = [
  { key: 'overview', label: '总览', hint: '连接状态与核心信息' },
  { key: 'profiles', label: '配置集', hint: 'cc-switch 风格的一键切换台' },
  { key: 'account', label: '账户登录', hint: '服务器、登录、注册、2FA' },
  { key: 'billing', label: '订阅与额度', hint: '余额、用量与续费建议' },
  { key: 'keys', label: 'API Key', hint: '选择 Key 并启动本地代理' },
  { key: 'templates', label: '接入模板', hint: 'Cherry Studio / OpenWebUI / CLI' },
  { key: 'diagnostics', label: '诊断', hint: '连通性、Key 与更新状态' },
  { key: 'updates', label: '软件更新', hint: '检查、下载并安装更新' }
]

const isLoggedIn = computed(() => !!config.value?.session?.accessToken && !!config.value?.session?.user)
const needs2FA = computed(() => !!config.value?.session?.requires2FA)
const selectedKeyId = computed(() => config.value?.proxy.selectedApiKeyId)
const registrationEnabled = computed(() => publicSettings.value?.registration_enabled !== false)
const emailVerifyEnabled = computed(() => !!publicSettings.value?.email_verify_enabled)
const promoCodeEnabled = computed(() => !!publicSettings.value?.promo_code_enabled)
const invitationCodeEnabled = computed(() => !!publicSettings.value?.invitation_code_enabled)
const turnstileEnabled = computed(() => !!publicSettings.value?.turnstile_enabled)
const activeProfile = computed(() => config.value?.profiles.find((profile) => profile.id === config.value?.activeProfileId) ?? null)
const profileCount = computed(() => config.value?.profiles.length ?? 0)
const localBaseUrl = computed(() => {
  const state = proxyState.value ?? config.value?.proxy
  if (!state) return 'http://127.0.0.1:3456/v1'
  return `http://${state.listenHost}:${state.listenPort}/v1`
})
const updateProgressLabel = computed(() => {
  const progress = updateState.value?.progress
  if (!progress) return '—'
  return `${progress.percent.toFixed(1)}%`
})
const updateVersionLabel = computed(() => {
  if (!updateState.value) return '未知'
  return updateState.value.latestVersion || updateState.value.downloadedVersion || updateState.value.currentVersion
})
const statusTone = computed(() => {
  if (proxyState.value?.running) return 'ok'
  if (updateState.value?.status === 'error') return 'warn'
  return 'idle'
})
const accountBadge = computed(() => {
  if (needs2FA.value) return '待二次验证'
  if (isLoggedIn.value) return '已登录'
  return '未登录'
})
const currentNav = computed(() => navItems.find((item) => item.key === currentSection.value) ?? navItems[0])
const activeKey = computed(() => apiKeys.value.find((key) => key.id === selectedKeyId.value) ?? null)
const profileCards = computed(() => {
  const profiles = config.value?.profiles ?? []
  return profiles.map((profile) => ({
    ...profile,
    isActive: profile.id === config.value?.activeProfileId,
    keyLabel: profile.selectedApiKeyId ? `#${profile.selectedApiKeyId}` : '未绑定',
    proxyLabel: `${profile.listenHost}:${profile.listenPort}`
  }))
})
const profileSummary = computed(() => {
  const profile = activeProfile.value
  return {
    name: profile?.name || '默认配置',
    server: profile?.serverUrl || serverUrl.value,
    key: profile?.selectedApiKeyId ? `#${profile.selectedApiKeyId}` : '未绑定',
    endpoint: profile ? `http://${profile.listenHost}:${profile.listenPort}/v1` : localBaseUrl.value
  }
})
const templateCards = computed(() => {
  const baseUrl = localBaseUrl.value
  const activeKeyLabel = activeKey.value ? `${activeKey.value.name} · #${activeKey.value.id}` : '先选择一个 API Key'
  return [
    {
      eyebrow: 'GUI',
      title: 'Cherry Studio / OpenWebUI',
      description: '这类 OpenAI 兼容客户端通常只需要 Base URL 和 API Key。',
      meta: `当前可直接复制到本地代理：${baseUrl}`,
      snippet: `Base URL: ${baseUrl}\nAPI Key: ${activeKey.value?.key || 'sk-xxx'}`,
      actionLabel: '复制 Base URL',
      actionText: baseUrl
    },
    {
      eyebrow: 'CLI',
      title: 'Claude Code / Codex / 终端工具',
      description: '先把本地代理作为兼容入口，再让 CLI 读取它。',
      meta: `当前 Key：${activeKeyLabel}`,
      snippet: `export OPENAI_BASE_URL="${baseUrl}"\nexport OPENAI_API_KEY="${activeKey.value?.key || 'sk-xxx'}"`,
      actionLabel: '复制环境变量',
      actionText: `export OPENAI_BASE_URL="${baseUrl}"\nexport OPENAI_API_KEY="${activeKey.value?.key || 'sk-xxx'}"`
    },
    {
      eyebrow: 'CHECK',
      title: '连通性快速自检',
      description: '用一条命令确认本地代理、授权和模型列表都能返回。',
      meta: '适合启动失败、Key 不对或远端不可达时排查。',
      snippet: `curl -H "Authorization: Bearer ${activeKey.value?.key || 'sk-xxx'}" ${baseUrl}/models`,
      actionLabel: '复制自检命令',
      actionText: `curl -H "Authorization: Bearer ${activeKey.value?.key || 'sk-xxx'}" ${baseUrl}/models`
    }
  ]
})
const keyQuotaSummary = computed(() => {
  const keys = apiKeys.value
  const totalQuota = keys.reduce((sum, key) => sum + (Number.isFinite(key.quota) ? key.quota : 0), 0)
  const totalUsed = keys.reduce((sum, key) => sum + (Number.isFinite(key.quota_used) ? key.quota_used : 0), 0)
  const activeKeys = keys.filter((key) => key.status === 'active').length
  const quotaPct = totalQuota > 0 ? Math.min(100, (totalUsed / totalQuota) * 100) : 0
  const expiringKeys = keys.filter((key) => {
    if (!key.expires_at) return false
    const expiresAt = new Date(key.expires_at).getTime()
    return Number.isFinite(expiresAt) && expiresAt - Date.now() <= 1000 * 60 * 60 * 24 * 30 && expiresAt > Date.now()
  }).length
  const nextExpiry = keys
    .filter((key) => key.expires_at)
    .map((key) => ({ name: key.name, expiresAt: new Date(key.expires_at as string).getTime() }))
    .filter((item) => Number.isFinite(item.expiresAt))
    .sort((a, b) => a.expiresAt - b.expiresAt)[0] ?? null

  return {
    totalQuota,
    totalUsed,
    quotaPct,
    activeKeys,
    expiringKeys,
    nextExpiry,
    status: quotaPct >= 90 ? 'warn' : activeKeys > 0 ? 'ok' : 'idle'
  }
})
const billingSummary = computed(() => {
  const user = config.value?.session.user
  return [
    {
      label: '当前余额',
      value: user?.balance ?? '—',
      detail: user ? '余额可用于继续开通与续费' : '登录后可查看账户余额'
    },
    {
      label: '额度使用',
      value: keyQuotaSummary.value.totalQuota > 0 ? `${keyQuotaSummary.value.quotaPct.toFixed(1)}%` : '—',
      detail: keyQuotaSummary.value.totalQuota > 0 ? `${keyQuotaSummary.value.totalUsed}/${keyQuotaSummary.value.totalQuota}` : '登录后会展示 Key 额度'
    },
    {
      label: '活跃 Key',
      value: keyQuotaSummary.value.activeKeys,
      detail: `${apiKeys.value.length} 个 Key 中可直接接入` 
    },
    {
      label: '近期到期',
      value: keyQuotaSummary.value.expiringKeys,
      detail: keyQuotaSummary.value.nextExpiry ? `${keyQuotaSummary.value.nextExpiry.name} · ${formatDate(keyQuotaSummary.value.nextExpiry.expiresAt)}` : '暂无到期 Key'
    }
  ]
})
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
function formatDate(value: string | number | Date | null | undefined) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormatter.format(date)
}
const overviewStats = computed(() => [
  {
    label: '连接状态',
    value: proxyState.value?.running ? '在线' : '未启动',
    detail: proxyState.value?.running ? '本地代理已经对外提供 OpenAI 兼容入口' : '先登录并选择一个 API Key'
  },
  {
    label: '当前账号',
    value: config.value?.session.user?.username || accountBadge.value,
    detail: config.value?.session.user?.balance != null ? `余额 ${config.value.session.user.balance}` : '登录后可查看余额与并发'
  },
  {
    label: '已选 Key',
    value: activeKey.value?.name || '未选择',
    detail: activeKey.value ? `ID #${activeKey.value.id}` : '前往 API Key 页面选择'
  },
  {
    label: '版本更新',
    value: updateVersionLabel.value,
    detail: updateState.value?.message || '可随时检查新版本'
  }
])

const diagnosticCards = computed(() => [
  {
    label: '登录',
    value: isLoggedIn.value ? '已连接' : '未登录',
    detail: isLoggedIn.value ? `当前用户：${config.value?.session.user?.username || '—'}` : '先完成登录后再选 Key',
    tone: isLoggedIn.value ? 'ok' : 'warn'
  },
  {
    label: 'Key 选择',
    value: selectedKeyId.value ? `#${selectedKeyId.value}` : '未选择',
    detail: activeKey.value ? `${activeKey.value.name} · ${activeKey.value.status}` : '从列表里点一个可用 Key',
    tone: selectedKeyId.value ? 'ok' : 'warn'
  },
  {
    label: '本地代理',
    value: proxyState.value?.running ? '运行中' : '未运行',
    detail: proxyState.value?.running ? localBaseUrl.value : '启动代理后，客户端指向这个地址',
    tone: proxyState.value?.running ? 'ok' : 'idle'
  },
  {
    label: '更新通道',
    value: updateState.value?.status || 'idle',
    detail: updateState.value?.message || '检查更新会从 GitHub Release 拉取元数据',
    tone: updateState.value?.status === 'error' ? 'warn' : updateState.value?.available ? 'ok' : 'idle'
  }
])

const diagnosticHeadline = computed(() => {
  if (!isLoggedIn.value) return '先登录，再接入'
  if (!selectedKeyId.value) return '先选择一个 Key'
  if (!proxyState.value?.running) return '可以启动本地代理'
  if (updateState.value?.available) return '有新版本可升级'
  return '连接正常'
})

const nextAction = computed(() => {
  if (!isLoggedIn.value) return '先在“账户登录”里登录你的 sub2api 账号。'
  if (!selectedKeyId.value) return '前往“API Key”页，选择一个可用的 Key。'
  if (!proxyState.value?.running) return '点击“启动本地代理”，把本地入口接给客户端。'
  if (updateState.value?.available) return '也可以先去“软件更新”页完成升级。'
  return '一切正常，可以直接在 Cherry Studio / OpenWebUI / CLI 中使用本地 Base URL。'
})


async function refreshConfig() {
  config.value = await window.connectApi.getConfig()
  serverUrl.value = config.value.serverProfile.serverUrl
  email.value = config.value.serverProfile.email
  profileName.value = config.value.profiles.find((profile) => profile.id === config.value?.activeProfileId)?.name || '当前配置'
  proxyState.value = await window.connectApi.getProxyState()
}

async function refreshPublicSettings() {
  const normalized = serverUrl.value.trim()
  if (!normalized) {
    publicSettings.value = null
    return
  }
  try {
    publicSettings.value = await window.connectApi.getPublicSettings(normalized)
  } catch {
    publicSettings.value = null
  }
}

async function refreshUpdateState() {
  try {
    updateState.value = await window.connectApi.getUpdateState()
  } catch (error) {
    updateState.value = {
      status: 'error',
      currentVersion: updateState.value?.currentVersion || '未知',
      message: error instanceof Error ? error.message : '无法读取更新状态。',
      checking: false,
      downloading: false,
      available: false,
      canCheck: false,
      canDownload: false,
      canInstall: false
    }
  }
}

async function saveProfile() {
  config.value = await window.connectApi.saveServerProfile({
    serverUrl: serverUrl.value,
    email: email.value
  })
  await refreshPublicSettings()
  statusMessage.value = '服务器地址已保存。'
}

async function handleRegister() {
  busy.value = true
  try {
    if (turnstileEnabled.value) {
      throw new Error('当前站点开启了 Turnstile，桌面端暂未接入人机验证注册。请先在网页端注册，或关闭 Turnstile 后再试。')
    }
    const result = await window.connectApi.register({
      serverUrl: serverUrl.value,
      email: email.value,
      password: password.value,
      verifyCode: registerVerifyCode.value || undefined,
      promoCode: registerPromoCode.value || undefined,
      invitationCode: registerInvitationCode.value || undefined
    })
    publicSettings.value = result.publicSettings || publicSettings.value
    await refreshConfig()
    await loadKeys()
    currentSection.value = 'keys'
    statusMessage.value = '注册成功，已自动登录。'
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '注册失败'
  } finally {
    busy.value = false
  }
}

async function handleLogin() {
  busy.value = true
  try {
    const result = await window.connectApi.login({
      serverUrl: serverUrl.value,
      email: email.value,
      password: password.value
    })
    publicSettings.value = result.publicSettings || null
    await refreshConfig()
    statusMessage.value = result.session.requires2FA ? '请输入二次验证码完成登录。' : '登录成功。'
    if (!result.session.requires2FA) {
      await loadKeys()
      currentSection.value = 'keys'
    }
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '登录失败'
  } finally {
    busy.value = false
  }
}

async function handle2FA() {
  if (!config.value?.session.tempToken) return
  busy.value = true
  try {
    const result = await window.connectApi.completeLogin2FA({
      serverUrl: serverUrl.value,
      tempToken: config.value.session.tempToken,
      code: totpCode.value
    })
    publicSettings.value = result.publicSettings || null
    await refreshConfig()
    await loadKeys()
    currentSection.value = 'keys'
    statusMessage.value = '二次验证成功，已完成登录。'
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '二次验证失败'
  } finally {
    busy.value = false
  }
}

async function loadKeys() {
  try {
    apiKeys.value = await window.connectApi.listKeys()
    await refreshConfig()
    if (apiKeys.value.length === 0) {
      statusMessage.value = '当前账号下还没有 API Key，请先在 sub2api 后台创建。'
    } else {
      statusMessage.value = `已加载 ${apiKeys.value.length} 个 API Key。`
    }
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '无法加载 API Key'
  }
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    statusMessage.value = `${label} 已复制。`
  } catch {
    statusMessage.value = '复制失败，请手动选择文本。'
  }
}

async function createProfileFromCurrent() {
  busy.value = true
  try {
    const name = profileName.value.trim() || '未命名配置'
    config.value = await window.connectApi.createProfile({ name })
    await refreshConfig()
    statusMessage.value = `已保存为配置集「${name}」。`
    currentSection.value = 'profiles'
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '创建配置集失败'
  } finally {
    busy.value = false
  }
}

async function activateProfile(profile: ConnectionProfile) {
  busy.value = true
  try {
    config.value = await window.connectApi.activateProfile(profile.id)
    apiKeys.value = []
    await refreshConfig()
    await loadKeys()
    currentSection.value = 'overview'
    statusMessage.value = `已切换到配置集「${profile.name}」。`
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '切换配置集失败'
  } finally {
    busy.value = false
  }
}

async function deleteProfile(profile: ConnectionProfile) {
  if (profile.id === config.value?.activeProfileId) {
    statusMessage.value = '当前激活的配置集不能直接删除，请先切换到其他配置集。'
    return
  }
  if (!window.confirm(`确认删除配置集「${profile.name}」吗？`)) {
    return
  }
  busy.value = true
  try {
    config.value = await window.connectApi.deleteProfile(profile.id)
    await refreshConfig()
    statusMessage.value = `配置集「${profile.name}」已删除。`
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '删除配置集失败'
  } finally {
    busy.value = false
  }
}

async function activateKey(key: ApiKeyRecord) {
  busy.value = true
  try {
    if (proxyState.value?.running) {
      proxyState.value = await window.connectApi.stopProxy()
    }
    proxyState.value = await window.connectApi.startProxy({
      selectedApiKey: key.key,
      selectedApiKeyId: key.id
    })
    await refreshConfig()
    await loadKeys()
    currentSection.value = 'overview'
    statusMessage.value = `已切换到 ${key.name} 并启动本地代理。`
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '切换 Key 失败'
  } finally {
    busy.value = false
  }
}

async function startProxy() {
  busy.value = true
  try {
    proxyState.value = await window.connectApi.startProxy()
    currentSection.value = 'overview'
    statusMessage.value = `本地代理已启动：${localBaseUrl.value}`
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '启动代理失败'
  } finally {
    busy.value = false
  }
}

async function stopProxy() {
  busy.value = true
  try {
    proxyState.value = await window.connectApi.stopProxy()
    statusMessage.value = '本地代理已停止。'
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '停止代理失败'
  } finally {
    busy.value = false
  }
}

async function checkForUpdates() {
  busy.value = true
  try {
    updateState.value = await window.connectApi.checkForUpdates()
    currentSection.value = 'updates'
    statusMessage.value = updateState.value.message
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '检查更新失败'
  } finally {
    busy.value = false
    await refreshUpdateState()
  }
}

async function downloadUpdate() {
  busy.value = true
  try {
    updateState.value = await window.connectApi.downloadUpdate()
    currentSection.value = 'updates'
    statusMessage.value = updateState.value.message
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '下载更新失败'
  } finally {
    busy.value = false
    await refreshUpdateState()
  }
}

async function installUpdate() {
  busy.value = true
  try {
    await window.connectApi.installUpdate()
    statusMessage.value = '正在退出并安装更新…'
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : '安装更新失败'
    busy.value = false
    await refreshUpdateState()
  }
}

async function logout() {
  busy.value = true
  try {
    config.value = await window.connectApi.logout()
    apiKeys.value = []
    proxyState.value = await window.connectApi.getProxyState()
    password.value = ''
    totpCode.value = ''
    currentSection.value = 'account'
    statusMessage.value = '已退出登录。'
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  await refreshConfig()
  await refreshPublicSettings()
  await refreshUpdateState()
  if (config.value?.session.accessToken) {
    await loadKeys()
  }
  updatePollTimer = window.setInterval(() => {
    void refreshUpdateState()
  }, 3000)
})

onBeforeUnmount(() => {
  if (updatePollTimer !== null) {
    window.clearInterval(updatePollTimer)
  }
})
</script>

<template>
  <main class="app-shell">
    <aside class="sidebar">
      <div class="brand-block">
        <div class="brand-logo">S2</div>
        <div>
          <p class="brand-kicker">sub2api Connect</p>
          <h1>桌面连接器</h1>
          <p class="muted small-text">参考 derouter.ai 的简洁产品风格，突出入口、状态与关键动作。</p>
        </div>
      </div>

      <nav class="sidebar-nav">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="nav-item"
          :class="{ active: currentSection === item.key }"
          @click="currentSection = item.key"
        >
          <span class="nav-title">{{ item.label }}</span>
          <span class="nav-hint">{{ item.hint }}</span>
        </button>
      </nav>

      <div class="sidebar-footer card-surface">
        <div class="status-chip" :class="statusTone">{{ proxyState?.running ? '代理已连接' : '等待连接' }}</div>
        <div class="sidebar-meta">
          <span>当前配置</span>
          <strong>{{ profileSummary.name }}</strong>
        </div>
        <div class="sidebar-meta">
          <span>本地入口</span>
          <strong>{{ localBaseUrl }}</strong>
        </div>
        <div class="sidebar-meta">
          <span>账户状态</span>
          <strong>{{ accountBadge }}</strong>
        </div>
        <div class="sidebar-meta">
          <span>当前版本</span>
          <strong>{{ updateState?.currentVersion || '未知' }}</strong>
        </div>
      </div>
    </aside>

    <section class="content-shell">
      <header class="topbar">
        <div class="topbar-copy">
          <p class="eyebrow">{{ currentNav.label }}</p>
          <h2>{{ publicSettings?.site_name || 'sub2api' }}</h2>
          <p class="lead">{{ currentNav.hint }}</p>
        </div>
        <div class="topbar-side">
          <div class="status-chip" :class="statusTone">{{ proxyState?.running ? '运行中' : '未运行' }}</div>
          <p class="version-line">{{ statusMessage }}</p>
        </div>
      </header>

      <section v-if="currentSection === 'overview'" class="content-grid">
        <article class="hero-panel card-surface">
          <div class="hero-copy">
            <p class="eyebrow">Affordable AI for your desktop</p>
            <h3>把登录、Key、代理入口与更新，压缩成一套足够清晰的桌面工作台</h3>
            <p class="muted hero-text">
              先连接你的 sub2api 服务，再选择 API Key，即可把本地入口接给 Cherry Studio、OpenWebUI、Claude Code 或其他 OpenAI 兼容工具。
            </p>
            <div class="hero-actions">
              <button :disabled="busy || !selectedKeyId || proxyState?.running" @click="startProxy">启动本地代理</button>
              <button class="secondary" :disabled="busy || !proxyState?.running" @click="stopProxy">停止代理</button>
              <button class="secondary" :disabled="busy" @click="currentSection = 'billing'">查看订阅</button>
              <button class="secondary" :disabled="busy" @click="currentSection = 'profiles'">配置集</button>
            </div>
          </div>
          <div class="hero-summary">
            <div v-for="item in overviewStats" :key="item.label" class="metric-card">
              <span class="metric-label">{{ item.label }}</span>
              <strong class="metric-value">{{ item.value }}</strong>
              <span class="metric-detail">{{ item.detail }}</span>
            </div>
          </div>
        </article>

        <div class="overview-grid">
          <article class="panel card-surface stack">
            <div class="section-head">
              <h3>核心状态</h3>
              <span class="status-chip" :class="statusTone">{{ proxyState?.running ? '连接正常' : '待连接' }}</span>
            </div>
            <div class="kv"><span>站点名</span><strong>{{ publicSettings?.site_name || 'sub2api' }}</strong></div>
            <div class="kv"><span>服务器地址</span><strong>{{ serverUrl }}</strong></div>
            <div class="kv"><span>本地 Base URL</span><strong>{{ localBaseUrl }}</strong></div>
            <div class="kv"><span>选中 Key</span><strong>{{ activeKey?.name || '未选择' }}</strong></div>
            <div class="kv"><span>当前配置</span><strong>{{ profileSummary.name }}</strong></div>
            <div class="kv"><span>可用 API Key</span><strong>{{ apiKeys.length }}</strong></div>
          </article>

          <article class="panel card-surface stack">
            <h3>账户摘要</h3>
            <div class="kv"><span>登录状态</span><strong>{{ accountBadge }}</strong></div>
            <div class="kv"><span>用户名</span><strong>{{ config?.session.user?.username || '未登录' }}</strong></div>
            <div class="kv"><span>余额</span><strong>{{ config?.session.user?.balance ?? '—' }}</strong></div>
            <div class="kv"><span>并发</span><strong>{{ config?.session.user?.concurrency ?? '—' }}</strong></div>
            <div class="row">
              <button class="secondary" :disabled="busy" @click="currentSection = 'account'">管理账户</button>
              <button class="secondary" :disabled="busy" @click="currentSection = 'keys'">查看 Key</button>
            </div>
          </article>

          <article class="panel card-surface stack">
            <h3>接入准备</h3>
            <div class="kv"><span>本地入口</span><strong>{{ localBaseUrl }}</strong></div>
            <div class="kv"><span>推荐流程</span><strong>登录 → 选 Key → 启动代理</strong></div>
            <div class="kv"><span>当前阶段</span><strong>{{ proxyState?.running ? '可直接接入' : '尚未完成连接' }}</strong></div>
            <div class="row">
              <button class="secondary" :disabled="busy" @click="currentSection = 'templates'">查看模板</button>
              <button class="secondary" :disabled="busy" @click="currentSection = 'updates'">软件更新</button>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="currentSection === 'profiles'" class="content-grid two-col-grid">
        <article class="panel card-surface stack">
          <div class="section-head">
            <h3>当前配置</h3>
            <span class="status-chip" :class="proxyState?.running ? 'ok' : 'idle'">{{ profileSummary.name }}</span>
          </div>
          <div class="subpanel">
            <p class="small-title">当前生效信息</p>
            <div class="kv"><span>配置名</span><strong>{{ profileSummary.name }}</strong></div>
            <div class="kv"><span>服务器</span><strong>{{ profileSummary.server }}</strong></div>
            <div class="kv"><span>本地入口</span><strong>{{ profileSummary.endpoint }}</strong></div>
            <div class="kv"><span>当前 Key</span><strong>{{ profileSummary.key }}</strong></div>
            <div class="kv"><span>配置总数</span><strong>{{ profileCount }}</strong></div>
          </div>
          <label>
            <span>保存为配置集名称</span>
            <input v-model="profileName" placeholder="例如：日常桌面 / 研发工作区" />
          </label>
          <div class="row">
            <button :disabled="busy" @click="createProfileFromCurrent">保存当前配置</button>
            <button class="secondary" :disabled="busy" @click="currentSection = 'keys'">去选 Key</button>
            <button class="secondary" :disabled="busy" @click="currentSection = 'overview'">返回总览</button>
          </div>
          <div class="subpanel">
            <p class="small-title">提示</p>
            <p class="muted small-text">配置集会记住服务器、端口、Base URL 与当前选中的 Key，方便快速切换路由。</p>
          </div>
        </article>

        <article class="panel card-surface stack">
          <div class="section-head">
            <h3>配置集列表</h3>
            <span class="status-chip" :class="profileCount > 0 ? 'ok' : 'idle'">{{ profileCount }} 个</span>
          </div>
          <div class="list" v-if="profileCards.length">
            <article v-for="profile in profileCards" :key="profile.id" class="key-item" :class="{ active: profile.isActive }">
              <div>
                <strong>{{ profile.name }}</strong>
                <p class="muted small-text">{{ profile.serverUrl }} · {{ profile.proxyLabel }} · {{ profile.keyLabel }}</p>
                <p class="muted small-text">创建于 {{ formatDate(profile.createdAt) }} · 更新于 {{ formatDate(profile.updatedAt) }}</p>
              </div>
              <div class="row key-actions">
                <span class="status-chip" :class="profile.isActive ? 'ok' : 'idle'">{{ profile.isActive ? '当前激活' : '可切换' }}</span>
                <button class="secondary copy-btn" :disabled="busy || profile.isActive" @click="activateProfile(profile)">启用此配置</button>
                <button class="secondary copy-btn" :disabled="busy || profile.isActive" @click="deleteProfile(profile)">删除</button>
              </div>
            </article>
          </div>
          <p v-else class="muted small-text">还没有保存过配置集，先在上方把当前连接保存下来。</p>
        </article>
      </section>

      <section v-else-if="currentSection === 'account'" class="content-grid two-col-grid">
        <article class="panel card-surface stack">
          <div class="section-head">
            <h3>服务器与登录</h3>
            <span class="status-chip" :class="isLoggedIn ? 'ok' : 'idle'">{{ accountBadge }}</span>
          </div>
          <label>
            <span>Server URL</span>
            <input v-model="serverUrl" placeholder="https://your-sub2api.example.com" />
          </label>
          <label>
            <span>邮箱</span>
            <input v-model="email" placeholder="name@example.com" />
          </label>
          <label>
            <span>密码</span>
            <input v-model="password" type="password" placeholder="请输入密码" />
          </label>
          <div class="row">
            <button class="secondary" :disabled="busy" @click="saveProfile">保存地址</button>
            <button class="secondary" :disabled="busy || !registrationEnabled || !serverUrl || !email || !password" @click="handleRegister">注册</button>
            <button :disabled="busy || !serverUrl || !email || !password" @click="handleLogin">登录</button>
          </div>

          <div v-if="needs2FA" class="subpanel">
            <p class="small-title">需要二次验证</p>
            <p class="muted small-text">{{ config?.session.userEmailMasked || '请打开验证器输入 6 位验证码。' }}</p>
            <label>
              <span>2FA 验证码</span>
              <input v-model="totpCode" placeholder="123456" />
            </label>
            <button :disabled="busy || !totpCode" @click="handle2FA">完成登录</button>
          </div>

          <div v-if="isLoggedIn" class="subpanel">
            <p class="small-title">当前用户</p>
            <div class="kv"><span>用户名</span><strong>{{ config?.session.user?.username }}</strong></div>
            <div class="kv"><span>余额</span><strong>{{ config?.session.user?.balance }}</strong></div>
            <div class="kv"><span>并发</span><strong>{{ config?.session.user?.concurrency }}</strong></div>
            <div class="row">
              <button class="secondary" :disabled="busy" @click="loadKeys">刷新 API Key</button>
              <button class="secondary" :disabled="busy" @click="currentSection = 'billing'">查看订阅</button>
              <button class="danger" :disabled="busy" @click="logout">退出</button>
            </div>
          </div>
        </article>

        <article class="panel card-surface stack">
          <h3>注册与站点能力</h3>
          <p v-if="turnstileEnabled" class="muted small-text">当前站点开启了 Turnstile。桌面端暂不支持该验证，建议先在网页端注册。</p>
          <label v-if="emailVerifyEnabled">
            <span>邮箱验证码</span>
            <input v-model="registerVerifyCode" placeholder="如站点启用邮箱验证，请填写验证码" />
          </label>
          <label v-if="promoCodeEnabled">
            <span>优惠码</span>
            <input v-model="registerPromoCode" placeholder="可选" />
          </label>
          <label v-if="invitationCodeEnabled">
            <span>邀请码</span>
            <input v-model="registerInvitationCode" placeholder="可选" />
          </label>
          <p class="muted small-text" v-if="registrationEnabled">注册成功后会自动登录当前桌面客户端。</p>
          <p class="muted small-text" v-else>当前站点未开放注册，请使用已有账号登录。</p>

          <div class="subpanel">
            <p class="small-title">站点能力</p>
            <div class="kv"><span>开放注册</span><strong>{{ registrationEnabled ? '是' : '否' }}</strong></div>
            <div class="kv"><span>邮箱验证</span><strong>{{ emailVerifyEnabled ? '开启' : '关闭' }}</strong></div>
            <div class="kv"><span>优惠码</span><strong>{{ promoCodeEnabled ? '开启' : '关闭' }}</strong></div>
            <div class="kv"><span>邀请码</span><strong>{{ invitationCodeEnabled ? '开启' : '关闭' }}</strong></div>
          </div>
        </article>
      </section>

      <section v-else-if="currentSection === 'keys'" class="content-grid two-col-grid">
        <article class="panel card-surface stack">
          <div class="section-head">
            <h3>API Key 与连接</h3>
            <span class="status-chip" :class="selectedKeyId ? 'ok' : 'idle'">{{ selectedKeyId ? '已就绪' : '未选择' }}</span>
          </div>
          <div class="subpanel">
            <p class="small-title">当前选择</p>
            <div class="kv"><span>Key 名称</span><strong>{{ activeKey?.name || '未选择' }}</strong></div>
            <div class="kv"><span>Key ID</span><strong>{{ selectedKeyId ?? '未选择' }}</strong></div>
            <div class="kv"><span>本地 Base URL</span><strong>{{ localBaseUrl }}</strong></div>
            <div class="kv"><span>代理状态</span><strong>{{ proxyState?.running ? '运行中' : '未运行' }}</strong></div>
          </div>
          <div class="row">
            <button class="secondary" :disabled="busy" @click="loadKeys">刷新列表</button>
            <button :disabled="busy || !selectedKeyId || proxyState?.running" @click="startProxy">启动本地代理</button>
            <button class="secondary" :disabled="busy || !proxyState?.running" @click="stopProxy">停止代理</button>
          </div>
        </article>

        <article class="panel card-surface stack">
          <h3>API Key 列表</h3>
          <div class="list" v-if="apiKeys.length">
            <article v-for="key in apiKeys" :key="key.id" class="key-item" :class="{ active: key.id === selectedKeyId }">
              <div>
                <strong>{{ key.name }}</strong>
                <p class="muted small-text">ID #{{ key.id }} · {{ key.status }} · 已用 {{ key.quota_used }}/{{ key.quota || '∞' }}</p>
              </div>
              <div class="row key-actions">
                <span class="status-chip" :class="key.id === selectedKeyId ? 'ok' : 'idle'">{{ key.status }}</span>
                <button class="secondary copy-btn" :disabled="busy || key.id === selectedKeyId" @click="activateKey(key)">启用此 Key</button>
              </div>
            </article>
          </div>
          <p v-else class="muted small-text">登录后这里会显示当前账号可用的 API Key 列表。</p>
        </article>
      </section>

      <section v-else-if="currentSection === 'billing'" class="content-grid two-col-grid">
        <article class="panel card-surface stack">
          <div class="section-head">
            <h3>订阅与额度</h3>
            <span class="status-chip" :class="keyQuotaSummary.status">{{ keyQuotaSummary.status === 'warn' ? '接近上限' : keyQuotaSummary.status === 'ok' ? '正常' : '待连接' }}</span>
          </div>
          <div class="subpanel">
            <p class="small-title">额度进度</p>
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: `${keyQuotaSummary.quotaPct}%` }"></div>
            </div>
            <div class="progress-meta">
              <span>{{ keyQuotaSummary.totalUsed }}</span>
              <strong>{{ keyQuotaSummary.totalQuota || '—' }}</strong>
              <span>{{ keyQuotaSummary.totalQuota > 0 ? `${keyQuotaSummary.quotaPct.toFixed(1)}% 已使用` : '暂无额度数据' }}</span>
            </div>
          </div>
          <div v-for="item in billingSummary" :key="item.label" class="kv">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
          <div class="row">
            <button class="secondary" :disabled="busy || !isLoggedIn" @click="loadKeys">刷新额度</button>
            <button :disabled="busy || !isLoggedIn" @click="currentSection = 'keys'">管理 Key</button>
          </div>
        </article>

        <article class="panel card-surface stack">
          <h3>续费建议</h3>
          <div class="subpanel">
            <p class="small-title">下一步操作</p>
            <p class="muted small-text">
              {{ !isLoggedIn ? '先登录账户，再刷新 Key 与额度。' : keyQuotaSummary.totalQuota === 0 ? '当前账号还没有可用额度或 Key，请先到后台创建 API Key。' : keyQuotaSummary.quotaPct >= 90 ? '当前额度接近上限，建议尽快续费或切换到更高配的 Key。' : '额度状态正常，可以直接进入 Key 页面启动本地代理。' }}
            </p>
          </div>
          <div class="subpanel">
            <p class="small-title">账户摘要</p>
            <div class="billing-grid">
              <div v-for="item in billingSummary" :key="item.label" class="billing-card">
                <span class="metric-label">{{ item.label }}</span>
                <strong class="metric-value">{{ item.value }}</strong>
                <span class="metric-detail">{{ item.detail }}</span>
              </div>
            </div>
          </div>
          <div class="row">
            <button class="secondary" :disabled="busy" @click="currentSection = 'overview'">返回总览</button>
            <button class="secondary" :disabled="busy" @click="currentSection = 'templates'">查看模板</button>
          </div>
        </article>
      </section>

      <section v-else-if="currentSection === 'templates'" class="content-grid template-grid">
        <article v-for="item in templateCards" :key="item.title" class="panel card-surface stack template-card">
          <div class="section-head">
            <p class="eyebrow">{{ item.eyebrow }}</p>
            <button class="secondary copy-btn" :disabled="busy" @click="copyText(item.actionText, item.actionLabel)">{{ item.actionLabel }}</button>
          </div>
          <h3>{{ item.title }}</h3>
          <p class="muted">{{ item.description }}</p>
          <div class="subpanel template-snippet">
            <p class="small-title">推荐配置</p>
            <pre>{{ item.snippet }}</pre>
          </div>
          <p class="muted small-text">{{ item.meta }}</p>
        </article>
      </section>

      <section v-else-if="currentSection === 'diagnostics'" class="content-grid two-col-grid">
        <article class="panel card-surface stack">
          <div class="section-head">
            <h3>连接健康检查</h3>
            <span class="status-chip" :class="diagnosticCards.some((item) => item.tone === 'warn') ? 'warn' : proxyState?.running ? 'ok' : 'idle'">{{ diagnosticHeadline }}</span>
          </div>
          <div class="diagnostic-grid">
            <div v-for="item in diagnosticCards" :key="item.label" class="diagnostic-card" :class="item.tone">
              <span class="metric-label">{{ item.label }}</span>
              <strong class="metric-value">{{ item.value }}</strong>
              <span class="metric-detail">{{ item.detail }}</span>
            </div>
          </div>
        </article>

        <article class="panel card-surface stack">
          <h3>建议动作</h3>
          <div class="subpanel">
            <p class="small-title">下一步</p>
            <p class="muted small-text">{{ nextAction }}</p>
          </div>
          <div class="subpanel">
            <p class="small-title">快速入口</p>
            <div class="row">
              <button class="secondary" :disabled="busy" @click="currentSection = 'account'">去登录</button>
              <button class="secondary" :disabled="busy" @click="currentSection = 'keys'">选 Key</button>
              <button class="secondary" :disabled="busy" @click="currentSection = 'templates'">看模板</button>
            </div>
          </div>
          <div class="subpanel">
            <p class="small-title">本地代理检查</p>
            <div class="kv"><span>监听地址</span><strong>{{ localBaseUrl }}</strong></div>
            <div class="kv"><span>最近错误</span><strong>{{ proxyState?.lastError || '无' }}</strong></div>
          </div>
        </article>
      </section>

      <section v-else class="content-grid two-col-grid">
        <article class="panel card-surface stack">
          <div class="section-head">
            <h3>软件更新</h3>
            <span class="status-chip" :class="updateState?.status === 'downloaded' ? 'ok' : updateState?.status === 'error' ? 'warn' : 'idle'">
              {{ updateState?.status || 'idle' }}
            </span>
          </div>
          <div class="kv"><span>当前版本</span><strong>{{ updateState?.currentVersion || '未知' }}</strong></div>
          <div class="kv"><span>目标版本</span><strong>{{ updateVersionLabel }}</strong></div>
          <div class="kv"><span>下载进度</span><strong>{{ updateProgressLabel }}</strong></div>
          <div class="kv"><span>更新状态</span><strong>{{ updateState?.message || '尚未初始化更新模块。' }}</strong></div>
          <div class="row">
            <button class="secondary" :disabled="busy || !updateState?.canCheck" @click="checkForUpdates">检查更新</button>
            <button :disabled="busy || !updateState?.canDownload" @click="downloadUpdate">下载更新</button>
            <button class="secondary" :disabled="busy || !updateState?.canInstall" @click="installUpdate">重启安装</button>
          </div>
          <p class="muted small-text">开发模式下会显示“不可用”；只有安装后的正式应用才支持自动更新。</p>
        </article>

        <article class="panel card-surface stack">
          <h3>发布说明</h3>
          <div class="subpanel">
            <p class="small-title">自动推送更新</p>
            <p class="muted small-text">打 tag 后，GitHub Actions 会构建多平台安装包，并把产物与 latest*.yml 元数据发布到 GitHub Release，供客户端更新模块拉取。</p>
          </div>
          <div class="subpanel">
            <p class="small-title">当前环境提醒</p>
            <p class="muted small-text">只有正式打包后的应用才会真正对接更新通道；本地 `npm run dev` 仅用于界面和流程开发。</p>
          </div>
        </article>
      </section>
    </section>
  </main>
</template>
