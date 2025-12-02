<script lang="ts" setup>

const props = defineProps<{
  name?: string
  autoNext?: boolean
}>()

const epoch = useEpoch(props.name ?? 'EPage')

// {
//   next() {
//     if (props.autoNext) {
//       this.done()
//     } else {
//       // this.maxVisited = Math.max(this.maxVisited, this.step + 1)
//       this._parent.enableNext()
//     }
//   }
// }

const emit = defineEmits<{
  (e: 'mounted'): void
}>()

onMounted(() => {
  emit('mounted')
  // if (!epoch._parent.enableNext) {
  //   throw new Error("EPage must be inside an ESequence")
  // }
})
</script>

<template>
  <div class="EPage">
    <slot :epoch="epoch"/>
  </div>
</template>
