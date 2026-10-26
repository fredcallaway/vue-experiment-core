import { useSessionStorage } from '@vueuse/core'
import { useUrlParams } from '../../utils/url-params'

const isEnabled = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(isEnabled)
  return value === null || (typeof value === 'string' && !['0', 'false', 'no'].includes(value.toLowerCase()))
}

export function useTutorialMode() {
  const route = useRoute()
  const router = useRouter()
  const tutorialMode = useSessionStorage('tutorial-mode', false)

  watch(() => route.query.tutorial, (value) => {
    if (value !== undefined) tutorialMode.value = isEnabled(value)
  }, { immediate: true })

  const toggleTutorialMode = async () => {
    const enabled = !tutorialMode.value
    tutorialMode.value = enabled
    const query = { ...useUrlParams() }
    if (enabled) query.tutorial = '1'
    else delete query.tutorial
    await router.replace({ path: route.path, query, hash: route.hash })
  }

  return { tutorialMode, toggleTutorialMode }
}
