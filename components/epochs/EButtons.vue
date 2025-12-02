<script lang="ts" setup>

const props = defineProps<{ name?: string, values: string | string[] }>()

const { done } = useEpoch(props.name ?? 'EButtons')

</script>

<template>
  <slot />
  <PButtons :values="props.values" @click="done" mt-2 />
</template>