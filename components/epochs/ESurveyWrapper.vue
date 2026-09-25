<script lang="ts" setup>
import { useESequence } from '../../composables/useESequence'

const props = defineProps<{
  name: string
}>()

const { Sequence } = useESequence(props.name)
</script>

<template>
  <div class="max-w-800px h-full mx-auto flex flex-wrap justify-center items-center">
    <Sequence>
      <slot />
    </Sequence>
  </div>
</template>
