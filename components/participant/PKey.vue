<script lang="ts" setup>

const { sleep } = useLocalAsync()

const props = defineProps<{
  keys?:  string | Key[]
  once?: boolean
  maxTime?: number
}>()

const emit = defineEmits<{
  (e: 'press', key: KeyPress): void
  (e: 'timeout'): void
}>()

const live = ref(true)
const spec = validateKeySpec(props.keys)
const P = useParticipant('PKey')

const unsub = P.onKeyPress(spec, (keyPress) => { 
  if (props.once) {
    live.value = false
    unsub()
  }
  emit('press', keyPress)
})

onMounted(async () =>{
  if (props.maxTime) {
    await sleep(props.maxTime)
    live.value = false
    unsub()
    emit('timeout')
  }
})
</script>

<template>
  <slot v-if="live"></slot>
</template>