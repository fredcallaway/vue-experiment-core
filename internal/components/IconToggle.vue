<script lang="ts" setup>
// <ToggleButton v-model="fast" label="Fast Mode" icon="i-mdi-speedometer" />
defineProps<{
  icon: string
  label: string
  tutorialTitle?: string
  tutorialHelp?: string
  tutorialPlacement?: 'bottom' | 'left'
}>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <TutorialTarget
    as="button"
    :title="tutorialTitle ?? (model ? `Disable ${label}` : `Enable ${label}`)"
    :help="tutorialHelp"
    :placement="tutorialPlacement"
    :aria-label="model ? `Disable ${label}` : `Enable ${label}`"
    :aria-pressed="model"
    @click="model = !model"
  >
    <div
      class="text-2xl"
      :class="[icon, model ? 'text-blue-500' : 'text-gray-300']"
    />
  </TutorialTarget>
</template>
