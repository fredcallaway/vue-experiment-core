export default defineNuxtConfig({
  extends: ['../outline'],
  components: [{ path: './components', pathPrefix: false, global: true }],
})
