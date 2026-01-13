<script lang="ts" setup>

const props = defineProps<{ 
  name?: string, 
  values: string | string[],
  disabled?: boolean
}>()

const { done } = useEpoch(props.name ?? 'EButtons')
const emit = defineEmits<{
  (e: 'click', value: string): void
}>()

const handleClick = (value: string) => {
  emit('click', value)
  done()
}
</script>

<template>
  <div>
    <slot />
    <PButtons :disabled="props.disabled" :values="props.values" @click="handleClick" mt-2 />
  </div>
</template>