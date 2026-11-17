import { defineEpochConfig, useConfig } from '../../../../composables/useConfig'

export default defineNuxtPlugin({
  enforce: 'pre',
  setup() {
    const fault = new URLSearchParams(window.location.search).get('fault')
    if (fault === 'plugin') throw new Error('Synthetic startup plugin failed', {
      cause: new Error('Original startup cause'),
    })
    if (fault === 'config') useConfig() // Deliberately read configuration before initialization.
    if (fault === 'guard') useRuntimeConfig().public.experimentDeployment = ''
    defineEpochConfig({ title: 'Fatal error fixture', icon: 'data:,', contactEmail: 'fixture@example.com',
      completion: { mode: 'link', link: '/dev' } })
  },
})
