<script lang="ts" setup>

const props = defineProps<{
  text: string
}>()
const { copy } = useClipboard()

</script>

<template>
  <button
    @click="copy(text)"
    class="i-mdi-clipboard-multiple ml-1 w-4 h-4 text-gray-500 hover:text-gray-700 cursor-pointer disabled:text-gray-400 disabled:cursor-not-allowed"
    w-4 h-4
  />
</template>

