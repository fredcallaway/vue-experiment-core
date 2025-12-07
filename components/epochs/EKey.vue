<script lang="ts" setup>

const { sleep } = useLocalAsync()

const props = defineProps<{
  name?: string
  keys?:  string | Key[]
  maxTime?: number
}>()

const { done } = useEpoch(props.name ?? 'EKey')

const result = defineModel<KeyPress | 'TIMEOUT' | null>({ default: null })
defineExpose({
  result,
})
watchOnce(result, () => done())

</script>

<template>
<div>
  <PKey once :keys="keys" @press="result = $event" @timeout="result = 'TIMEOUT'" >
    <slot />
  </PKey>
</div>
</template>

