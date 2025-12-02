<script lang="ts" setup>

const props = defineProps<{ name?: string, button?: boolean }>()

const { done } = useEpoch(props.name ?? 'EContinue')

</script>

<template>
  <EButtons v-if="button" :values="['Continue']" :name="name">
    <slot />
  </EButtons>
  <EKey v-else :keys="['SPACE']" :name="name">
    <slot />
    <div text-sm text-primary-200 font-italic text-center mt-2>press space to continue.</div>
  </EKey>
</template>