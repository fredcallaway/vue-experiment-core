<script lang="ts" setup>

const props = defineProps<{ 
  name?: string, 
  button?: boolean, 
  delay?: NumberLike,
}>()

const { done } = useEpoch(props.name ?? 'EContinue')

const ms = ensureNumber(props.delay ?? 0)
const ready = useTimeout(replaceFast(ms, Math.max(200, ms / 5)))

</script>

<template>
  <div>
    <div>
      <slot />
    </div>
    <PButton v-if="button" :disabled="!ready" value="Continue" @click="done" mt-2 />
    <PKey v-else-if="ready" keys="SPACE" @press="done">
      <div text-sm text-primary-200 font-italic text-center mt-2>press space to continue.</div>
    </PKey>
  </div>
</template>