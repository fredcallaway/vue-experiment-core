<script lang="ts" setup>

// A leaf page of documentation: declares the epoch and appends a "Next" button
// (calling done()) so the docs can be read linearly; the outline handles random
// access. `last` omits the button on the final page.
const props = defineProps<{
  name: string
  last?: boolean
}>()

const epoch = useEpoch(props.name)

</script>

<template>
  <div>
    <slot />
    <div v-if="!last" mt-8>
      <PButton once value="Next" btn-primary @click="epoch.done" />
    </div>
  </div>
</template>
