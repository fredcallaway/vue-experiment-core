<script lang="ts" setup>

const props = defineProps<{ 
  name?: string, 
  button?: boolean, 
  delay?: NumberLike,
  prompt?: boolean,
}>()

const epoch = useEpoch(props.name ?? 'EContinue')

const emit = defineEmits<{ (e: 'mounted', epoch: Epoch): void }>()
onMounted(() => emit('mounted', epoch))

const ms = ensureNumber(props.delay ?? 0)
const ready = useTimeout(replaceFast(ms, Math.max(200, ms / 5)))

</script>

<template>
  <div>
    <div :class="{ 'prompt': prompt }">
      <slot />
    </div>
    <PButton v-if="button" :disabled="!ready" value="Continue" @click="epoch.done" mt-2 />
    <PKey v-else-if="ready" keys="SPACE" @press="epoch.done">
      <div text-primary-300 font-italic text-center mt-2>press space to continue.</div>
    </PKey>
  </div>
</template>