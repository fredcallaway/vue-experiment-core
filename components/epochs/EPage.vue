<script lang="ts" setup>
import { type Epoch, useEpoch } from '../../composables/useEpoch'
import { useLocalAsync } from '../../composables/useLocalAsync'
import { type NumberLike, ensureNumber } from '../../utils/misc'
import { R } from '../../utils/remeda-extensions'


const props = defineProps<{
  name?: string
  prompt?: boolean
  duration?: NumberLike
}>()

const epoch = useEpoch(props.name ?? 'EPage')
const { sleep } = useLocalAsync()

const state = reactive({} as Record<string,any>)

const emit = defineEmits<{ (e: 'mounted', epoch: Epoch): void }>()
onMounted(async () => {
  emit('mounted', epoch)
  if (R.isDefined(props.duration)) {
    await sleep(ensureNumber(props.duration))
    epoch.done()
  }
})

</script>

<template>
  <div :class="{ 'prompt': prompt }" >
    <slot :epoch="epoch" :done="epoch.done" :state="state" />
  </div>
</template>
