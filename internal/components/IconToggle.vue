<script lang="ts" setup>
// <ToggleButton v-model="fast" label="Fast Mode" icon="i-mdi-speedometer" />
defineProps<{ icon: string; label: string }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <button @click="model = !model">
    <div
      :title="model ? `Disable ${label}` : `Enable ${label}`"
      :class="[icon, model ? 'text-blue-500' : 'text-gray-300']"
      text-2xl
    />
  </button>
</template>
