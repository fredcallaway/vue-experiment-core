// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // we want a standard single page application, no server-side rendering
  ssr: false,

  nitro: {
    prerender: {
      crawlLinks: false,
      routes: [],
    },
    rollupConfig: {
      output: {
        sourcemapExcludeSources: false,
      },
    },
  },
  
  components: [
    {
      path: './components',
      pathPrefix: false,
      global: true,
    },
    {
      path: './internal/components',
      pathPrefix: false,
      global: true,
    },
  ],

  modules: [
    '@nuxt/eslint',
    '@unocss/nuxt',
    '@vueuse/nuxt',
    (_options, nuxt) => {
      const sourcemaps = nuxt.options.posthogConfig?.sourcemaps
      if (sourcemaps && !sourcemaps.personalApiKey?.startsWith('phx_')) {
        sourcemaps.enabled = false
      }
    },
    '@posthog/nuxt',
  ],

  imports: {
    dirs: ['composables', 'internal/composables', 'internal'],
  },
  
  compatibilityDate: '2025-05-15',

  devtools: {
    enabled: true,
    timeline: {
      enabled: true
    }
  }
})
