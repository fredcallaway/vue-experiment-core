<script lang="ts" setup>
const props = defineProps<{
  icon: string
  title: string
  disabled?: boolean
  tone?: 'default' | 'danger'
}>()
defineEmits<{ click: [] }>()

const enabledClass = computed(() => {
  if (props.tone === 'danger') return 'text-red-500 hover:text-red-600 active:translate-y-0.1 active:scale-94'
  return 'text-gray-400 hover:text-gray-500 active:translate-y-0.1 active:scale-94'
})
</script>

<template>
  <button
    @click="$emit('click')"
    :disabled="props.disabled"
    :class="props.disabled ? 'cursor-not-allowed' : ''"
  >
    <div
      :title="props.title"
      :class="[
        props.icon,
        props.disabled
          ? 'text-gray-300'
          : enabledClass,
      ]"
      text-2xl
      transition-transform
      duration-75
    />
  </button>
</template>
