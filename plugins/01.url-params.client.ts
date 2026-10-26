import { useUrlParams } from '../utils/url-params'

export default defineNuxtPlugin(() => {
  const params = useUrlParams()
  // VueUse observes popstate, but client-side router navigation does not emit it.
  // Keep its shared query state current so a later pin/condition edit preserves navigation flags.
  useRouter().afterEach((route) => {
    for (const key of Object.keys(params)) {
      if (!(key in route.query)) delete params[key]
    }
    for (const [key, value] of Object.entries(route.query)) {
      params[key] = Array.isArray(value) ? value.map(item => item ?? '') : value ?? ''
    }
  })
})
