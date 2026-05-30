<script lang="ts" setup>
const props = defineProps<{
  name: string
}>()

const { Sequence } = useESequence(props.name)
</script>

<template>
  <div max-w-800px h-full mx-auto flex flex-center>
    <Sequence>
      <slot />
    </Sequence>
  </div>
</template>
