<script lang="ts" setup>

const props = defineProps<{
  name?: string
  keys?:  string | Key[]
  once?: boolean
}>()

const { done } = useEpoch(props.name ?? 'EKey')
</script>

<template>
<div>
  <PKey :keys="keys" :once="once" @press="done">
    <slot />
  </PKey>
</div>
</template>

