<script setup lang="ts">
definePageMeta({ layout: 'bare' })

if (import.meta.dev) await navigateTo('/dev')
</script>

<template>
  <main class="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center">
    <p class="text-lg">If you're here to do an experiment, you have the wrong link.</p>
    <NuxtLink to="/dev" class="btn-primary">Open Developer Mode</NuxtLink>
  </main>
</template>
