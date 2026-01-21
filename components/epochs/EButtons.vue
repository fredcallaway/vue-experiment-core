<script lang="ts" setup>

const props = defineProps<{ 
  name?: string, 
  values: string | string[],
  classes?: string | string[],
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
    <PButtons :disabled="props.disabled" :values="props.values" :classes="props.classes" @click="handleClick" mt-2 />
  </div>
</template>