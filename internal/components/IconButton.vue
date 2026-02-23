<script lang="ts" setup>
defineProps<{ icon: string; title: string }>()
defineEmits<{ click: [] }>()
</script>

<template>
  <button @click="$emit('click')">
    <div
      :title="title"
      :class="icon"
      text-2xl
      text-gray-400
      hover:text-gray-700
      active:translate-y-0.1
      active:scale-94
      transition-transform
      duration-75
    />
  </button>
</template>
