import { defineEpochConfig } from '../../../../composables/useConfig'

defineEpochConfig({
  title: 'Outline navigation fixture',
  version: 'fixture',
  icon: 'data:,',
  contactEmail: 'fixture@example.com',
  completion: { mode: 'link', link: '/dev' },
})

export default defineNuxtPlugin(() => {})
