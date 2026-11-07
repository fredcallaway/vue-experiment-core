// https://nuxt.com/docs/api/configuration/nuxt-config
import { readDeploymentConfig } from './operations/experiment-config'

export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      // Embedded in this build, never read from the mutable current-deployment database record.
      experimentDeployment: process.env.EXPERIMENT_DEPLOYMENT || '',
    },
  },
  $env: {
    deployment: {
      // Tracked deployment must not clear the running development server's build files.
      buildDir: '.nuxt/production',
    },
  },

  // Nuxt generation creates this alias to .output/public; generated HTML must not trigger HMR.
  ignore: ['dist'],

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
    async (_options, nuxt) => {
      if (!nuxt.options.dev && !nuxt.options._prepare) await readDeploymentConfig(nuxt.options.rootDir)
      const sourcemaps = nuxt.options.posthogConfig?.sourcemaps
      if (sourcemaps && !sourcemaps.personalApiKey?.startsWith('phx_')) {
        sourcemaps.enabled = false
      }
    },
    '@posthog/nuxt',
  ],

  imports: {
    // Keep Vue/Nuxt APIs; import project/core helpers and third-party APIs explicitly.
    scan: false,
  },
  
  compatibilityDate: '2025-05-15',

  devtools: {
    enabled: true,
    timeline: {
      enabled: true
    }
  }
})
