export default defineNuxtPlugin({
  name: 'seeded-random',
  // Layer plugins can precede project plugins with the same order.
  order: 1,
  async setup() {
    // Load after the project's 00.config plugin, before experiment setup.
    const { random } = await import('../utils/random')
    let hasWarned = false
    Math.random = () => {
      if (!hasWarned) {
        console.warn('Intercepting Math.random to use the global seeded RNG; use trueRandom() for non-seeded randomness')
        hasWarned = true
      }
      return random.float()
    }
  },
})
