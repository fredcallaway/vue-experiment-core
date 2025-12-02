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

/* ensure scrollbar doesn't mess with layout */
:root, html {
  overflow-y: scroll;
  scrollbar-gutter: stable;
}

/* reset default styles */
button {
  color: inherit;
  border: inherit;
  cursor: pointer;
  background-color: inherit;
}

input, select, textarea {
  outline: none;
  box-shadow: none;
  background-color: #fff;
  color: #101010;
  box-shadow: none;
  border-style: solid;
  border-color: #101010;
  /* border-width: 1px; */
}

h1, h2, h3, h4, h5, h6, p {
  margin-top: 0; 
}

pre {
  margin-top: 0;
  margin-bottom: 0;
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