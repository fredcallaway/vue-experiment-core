<script lang="ts" setup>
const props = defineProps<{
  icon: string
  title: string
  disabled?: boolean
  tone?: 'default' | 'danger'
  tutorialTitle?: string
  tutorialHelp?: string
  tutorialPlacement?: 'bottom' | 'left'
}>()
defineEmits<{ click: [] }>()

const enabledClass = computed(() => {
  if (props.tone === 'danger') return 'text-red-500 hover:text-red-600 active:translate-y-0.1 active:scale-94'
  return 'text-gray-400 hover:text-gray-500 active:translate-y-0.1 active:scale-94'
})
</script>

<template>
  <TutorialTarget
    as="button"
    :title="props.tutorialTitle ?? props.title"
    :help="props.tutorialHelp"
    :placement="props.tutorialPlacement"
    :aria-label="props.title"
    :disabled="props.disabled"
    :class="props.disabled ? 'cursor-not-allowed' : ''"
    @click="$emit('click')"
  >
    <div
      class="text-2xl transition-transform duration-75"
      :class="[
        props.icon,
        props.disabled
          ? 'text-gray-300'
          : enabledClass,
      ]"
    />
  </TutorialTarget>
</template>
