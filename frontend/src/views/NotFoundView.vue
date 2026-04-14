<template>
  <div
    class="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-primary-50/70 px-4"
  >
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-primary-400/14 blur-3xl"></div>
      <div class="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-indigo-400/10 blur-3xl"></div>
      <div class="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-300/8 blur-3xl"></div>
    </div>

    <div class="relative z-10 w-full max-w-lg text-center">
      <div class="mb-8">
        <div class="relative inline-block">
          <span class="text-[12rem] font-black leading-none tracking-tight text-slate-100">404</span>
          <div class="absolute inset-0 flex items-center justify-center">
            <div
              class="flex h-24 w-24 items-center justify-center rounded-[1.5rem] border border-white/80 bg-white/90 shadow-[0_18px_60px_rgba(99,102,241,0.14)]"
            >
              <svg
                class="h-12 w-12 text-primary-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div class="mb-8 rounded-[1.75rem] border border-slate-200 bg-white/85 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <h1 class="mb-3 text-2xl font-semibold text-slate-950">{{ t('errors.pageNotFound') }}</h1>
        <p class="text-sm leading-6 text-slate-600">
          The page you are looking for doesn't exist or has been moved.
        </p>
      </div>

      <div class="flex flex-col justify-center gap-3 sm:flex-row">
        <button
          @click="goBack"
          class="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50"
        >
          <Icon name="arrowLeft" size="md" class="mr-2" />
          Go Back
        </button>
        <router-link
          to="/dashboard"
          class="inline-flex items-center justify-center rounded-full border border-primary-500 bg-gradient-to-r from-primary-600 to-primary-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(99,102,241,0.25)] transition-all hover:from-primary-500 hover:to-primary-400"
        >
          <Icon name="home" size="md" class="mr-2" />
          Go to Dashboard
        </router-link>
      </div>

      <p class="mt-8 text-sm text-slate-500">
        Need help?
        <a href="#" class="text-primary-600 transition-colors hover:text-primary-700">
          Contact support
        </a>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Icon from '@/components/icons/Icon.vue'

const { t } = useI18n()
const router = useRouter()

function goBack(): void {
  router.back()
}
</script>
