<script setup lang="ts">
import { logEvent } from '../../../../composables/logEvent'
import { getCompletionCode } from '../../../../internal/prolific'

const count = ref(0)
const completionCode = getCompletionCode('COMPLETED')
const respond = () => {
  count.value++
  logEvent('fixture.response', { count: count.value })
}
</script>

<template>
  <ESequence name="fixture">
    <EPage name="trial">
      <h1>Debug saving fixture</h1>
      <p>Responses: {{ count }}</p>
      <p data-testid="completion-code">{{ completionCode }}</p>
      <PButton value="Respond" @click="respond" />
    </EPage>
  </ESequence>
</template>
