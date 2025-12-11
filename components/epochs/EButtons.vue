<script lang="ts" setup>

const props = defineProps<{ 
  name?: string, 
  values: string | string[],
  disabled?: boolean
}>()

const { done } = useEpoch(props.name ?? 'EButtons')

</script>

<template>
  <div>
    <slot />
    <PButtons :disabled="props.disabled" :values="props.values" @click="done" mt-2 />
  </div>
</template>