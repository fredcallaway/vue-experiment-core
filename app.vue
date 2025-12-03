<script setup>
const config = useConfig()

console.log('------------ initializing app ------------')
console.log('version: ', config.version)

useHead({
  title: config.title,
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: config.icon }
  ]
})

onMounted(async () => {
  const route = useRoute()
  if (route.query.jump && typeof route.query.jump === 'string') {
      await jumpToEpoch(route.query.jump)
  }
})

</script>

<template>
  <SizeScaler />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>

:root {
  font-family: helvetica, arial, sans-serif;
  font-size: 16px;
  color: #101010;
  background-color: #ffffff;
}

button {
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
}

input, select, textarea {
  outline: inherit;
}

a {
  @apply text-blue underline;
}

h1 { font-size: 2em; font-weight: bold; }
h2 { font-size: 1.5em; font-weight: bold; }
h3 { font-size: 1.17em; font-weight: bold; }
h4 { font-size: 1em; font-weight: bold; }
h5 { font-size: 0.83em; font-weight: bold; }
h6 { font-size: 0.67em; font-weight: bold; }

/* ensure scrollbar doesn't mess with layout */
:root, html {
  overflow-y: scroll;
  scrollbar-gutter: stable;
}

.subtle-scrollbar {
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

.subtle-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.subtle-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

</style>