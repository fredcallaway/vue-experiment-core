// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // we want a standard single page application, no server-side rendering
  ssr: false,

  nitro: {
    prerender: {
      crawlLinks: false,
      routes: [],
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
  ],

  imports: {
    dirs: ['composables', 'internal/**', 'internal']
  },
  
  compatibilityDate: '2025-05-15',

  devtools: {
    enabled: true,
    timeline: {
      enabled: true
    }
  }
})
