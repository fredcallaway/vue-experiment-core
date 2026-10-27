<script setup lang="ts">
import { useEpoch } from '../../../../composables/useEpoch'
import { useLocalAsync } from '../../../../composables/useLocalAsync'

const epoch = useEpoch('async')
const { sleep } = useLocalAsync()
const pending = ref(false)
async function finishLater() {
  pending.value = true
  await sleep(1200)
  epoch.done()
}
</script>

<template>
  <section>
    <p>{{ pending ? 'Async completion pending' : 'Async epoch ready' }}</p>
    <PButton value="Schedule completion" :disabled="pending" @click="finishLater" />
  </section>
</template>
