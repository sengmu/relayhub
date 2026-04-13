<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ApiKeyRecord, AppConfig, ProxyRuntimeState, PublicSettings, UpdateState } from './shared/contracts'

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
const statusMessage = ref('准备就绪')
const busy = ref(false)
let updatePollTimer: number | null = null

const isLoggedIn = computed(() => !!config.value?.session?.accessToken && !!config.value?.session?.user)
const needs2FA = computed(() => !!config.value?.session?.requires2FA)
const selectedKeyId = computed(() => config.value?.proxy.selectedApiKeyId)
const registrationEnabled = computed(() => publicSettings.value?.registration_enabled !== false)
const emailVerifyEnabled = computed(() => !!publicSettings.value?.email_verify_enabled)
const promoCodeEnabled = computed(() => !!publicSettings.value?.promo_code_enabled)
const invitationCodeEnabled = computed(() => !!publicSettings.value?.invitation_code_enabled)
const turnstileEnabled = computed(() => !!publicSettings.value?.turnstile_enabled)
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

async function refreshConfig() {
  config.value = await window.connectApi.getConfig()
  serverUrl.value = config.value.serverProfile.serverUrl
  email.value = config.value.serverProfile.email
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

async function startProxy() {
  busy.value = true
  try {
    proxyState.value = await window.connectApi.startProxy()
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
  <main class="shell">
    <section class="hero card">
      <div>
        <p class="eyebrow">sub2api Connect</p>
        <h1>像 VPN 一样简单的 AI 连接器</h1>
        <p class="muted">
          登录你的 sub2api 服务，选择一个 API Key，然后一键开启本地 OpenAI 兼容入口。
        </p>
      </div>
      <div class="hero-side">
        <div class="badge" :class="proxyState?.running ? 'ok' : 'idle'">
          {{ proxyState?.running ? '已连接' : '未连接' }}
        </div>
        <div class="small-text">{{ localBaseUrl }}</div>
      </div>
    </section>

    <section class="grid">
      <div class="card stack">
        <h2>1. 服务器与登录</h2>
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

        <div v-if="registrationEnabled" class="subcard">
          <p class="small-title">注册新账号</p>
          <p v-if="turnstileEnabled" class="muted small-text">当前站点开启了 Turnstile。桌面端暂不支持该验证，建议先到网页端注册。</p>
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
          <p class="muted small-text">注册成功后会自动登录当前桌面客户端。</p>
        </div>
        <p v-else class="muted small-text">当前站点未开放注册，请使用已有账号登录。</p>

        <div v-if="needs2FA" class="subcard">
          <p class="small-title">需要二次验证</p>
          <p class="muted small-text">{{ config?.session.userEmailMasked || '请打开你的验证器输入 6 位验证码。' }}</p>
          <label>
            <span>2FA 验证码</span>
            <input v-model="totpCode" placeholder="123456" />
          </label>
          <button :disabled="busy || !totpCode" @click="handle2FA">完成登录</button>
        </div>

        <div v-if="isLoggedIn" class="subcard">
          <p class="small-title">当前用户</p>
          <div class="kv"><span>用户名</span><strong>{{ config?.session.user?.username }}</strong></div>
          <div class="kv"><span>余额</span><strong>{{ config?.session.user?.balance }}</strong></div>
          <div class="kv"><span>并发</span><strong>{{ config?.session.user?.concurrency }}</strong></div>
          <div class="row">
            <button class="secondary" :disabled="busy" @click="loadKeys">刷新 API Key</button>
            <button class="danger" :disabled="busy" @click="logout">退出</button>
          </div>
        </div>
      </div>

      <div class="card stack">
        <h2>2. API Key 与连接</h2>
        <div class="subcard">
          <p class="small-title">当前选择</p>
          <p class="muted small-text">
            默认自动选择第一个 active API Key。后续可扩展为手动切换、多服务配置和诊断页。
          </p>
          <div class="kv"><span>Key ID</span><strong>{{ selectedKeyId ?? '未选择' }}</strong></div>
          <div class="kv"><span>本地 Base URL</span><strong>{{ localBaseUrl }}</strong></div>
          <div class="kv"><span>推荐 API Key</span><strong>***</strong></div>
        </div>

        <div class="list" v-if="apiKeys.length">
          <article v-for="key in apiKeys" :key="key.id" class="key-item" :class="{ active: key.id === selectedKeyId }">
            <div>
              <strong>{{ key.name }}</strong>
              <p class="muted small-text">ID #{{ key.id }} · {{ key.status }} · 已用 {{ key.quota_used }}/{{ key.quota || '∞' }}</p>
            </div>
            <span class="pill" :class="key.status">{{ key.status }}</span>
          </article>
        </div>
        <p v-else class="muted small-text">登录后这里会显示当前账号可用的 API Key 列表。</p>

        <div class="row">
          <button :disabled="busy || !selectedKeyId || proxyState?.running" @click="startProxy">启动本地代理</button>
          <button class="secondary" :disabled="busy || !proxyState?.running" @click="stopProxy">停止本地代理</button>
        </div>
      </div>
    </section>

    <section class="grid lower">
      <div class="card stack">
        <h2>3. 一键接入模板</h2>
        <div class="template-grid">
          <div class="subcard">
            <p class="small-title">Cherry Studio</p>
            <p class="muted small-text">Base URL 填 {{ localBaseUrl }}，API Key 填任意字符串或 ***。</p>
          </div>
          <div class="subcard">
            <p class="small-title">OpenWebUI</p>
            <p class="muted small-text">新增 OpenAI 兼容提供商，地址指向 {{ localBaseUrl }}。</p>
          </div>
          <div class="subcard">
            <p class="small-title">Claude Code</p>
            <p class="muted small-text">后续补 CLI 一键配置脚本；当前先复制本地 Base URL。</p>
          </div>
          <div class="subcard">
            <p class="small-title">Codex</p>
            <p class="muted small-text">通过 OpenAI 兼容模式指向本地代理，减少用户直接接触远端配置。</p>
          </div>
        </div>
      </div>

      <div class="card stack">
        <h2>4. 状态与诊断</h2>
        <div class="subcard">
          <div class="kv"><span>站点名</span><strong>{{ publicSettings?.site_name || 'sub2api' }}</strong></div>
          <div class="kv"><span>版本</span><strong>{{ publicSettings?.version || '未知' }}</strong></div>
          <div class="kv"><span>开放注册</span><strong>{{ registrationEnabled ? '是' : '否' }}</strong></div>
          <div class="kv"><span>邮箱验证</span><strong>{{ emailVerifyEnabled ? '开启' : '关闭' }}</strong></div>
          <div class="kv"><span>代理状态</span><strong>{{ proxyState?.running ? '运行中' : '未运行' }}</strong></div>
          <div class="kv"><span>最近状态</span><strong>{{ statusMessage }}</strong></div>
          <div class="kv" v-if="proxyState?.lastError"><span>最近错误</span><strong>{{ proxyState.lastError }}</strong></div>
        </div>

        <div class="subcard">
          <div class="section-head">
            <p class="small-title">软件更新</p>
            <span class="pill" :class="updateState?.status === 'downloaded' ? 'active' : 'inactive'">
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
          <p class="muted small-text">
            开发模式下会显示“不可用”；只有安装后的正式应用才支持自动更新。
          </p>
        </div>
      </div>
    </section>
  </main>
</template>
