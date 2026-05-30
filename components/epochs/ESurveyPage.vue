<script lang="ts" setup>
defineProps<{
  prompt?: string
  question?: string
}>()
</script>

<template>
  <div class="survey-page" max-w-800px mx-auto flex flex-col gap-8 flex-1>
    <div v-if="prompt" class="survey-page__prompt" text-center italic v-html="prompt" />
    <div v-if="question" class="survey-page__question" flex-1 flex items-center justify-center min-h-150px>
      <p text-xl text-center leading-relaxed m-0>{{ question }}</p>
    </div>
    <slot />
    <slot name="footer" />
  </div>
</template>

<style scoped>
.survey-page :deep(.prompt) {
  @apply max-w-160 mx-auto text-lg line-height-snug mt-2 mb-2;
}
</style>
