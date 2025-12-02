<script setup lang="ts">
const props = defineProps<{
  title: string
}>()

const registerTab = inject('registerTab')
if (!registerTab) {
  throw new Error('Tab must be used within TabContainer')
}
// @ts-ignore
const thisTabActive = registerTab(props.title)

</script>

<template>
  <div v-if="thisTabActive">
    <slot />
  </div>
</template>

