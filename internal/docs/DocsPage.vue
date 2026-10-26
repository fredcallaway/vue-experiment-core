<script lang="ts" setup>
import { useEpoch } from '../../composables/useEpoch'


// A leaf page of documentation: declares the epoch and appends a "Next" button
// (calling done()) so the docs can be read linearly; the outline handles random
// access. `last` omits the button on the final page.
const props = defineProps<{
  name: string
  last?: boolean
}>()

const epoch = useEpoch(props.name)

const page = ref<HTMLElement>()
onMounted(() => {
  page.value?.closest('.docs-content')?.scrollTo(0, 0)
})
</script>

<template>
  <div ref="page" :data-doc-page="name">
    <slot />
    <div class="mt-8" v-if="!last">
      <PButton class="btn-primary" once value="Next" @click="epoch.done" />
    </div>
  </div>
</template>
