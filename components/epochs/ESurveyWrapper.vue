<script lang="ts" setup>
const props = defineProps<{
  name: string
}>()

const { Sequence } = useESequence(props.name)
</script>

<template>
  <div max-w-800px mx-auto flex flex-col>
    <Sequence>
      <slot />
    </Sequence>
  </div>
</template>
