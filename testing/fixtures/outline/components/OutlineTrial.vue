<script setup lang="ts">
import { useESequence } from '../../../../composables/useESequence'

const props = defineProps<{ block: number; trial: number }>()
const { Sequence } = useESequence('trial')
const count = ref(0)
const mount = Math.random().toString(36)
</script>

<template>
  <section>
    <p data-testid="trial-position">Block {{ props.block + 1 }}, trial {{ props.trial + 1 }}</p>
    <p data-testid="trial-state">Trial count: {{ count }}; mount: {{ mount }}</p>
    <PButton value="Increment trial" @click="count++" />
    <Sequence>
      <EContinue name="choice" button="Show feedback">Trial choice</EContinue>
      <EContinue name="feedback" button="Finish trial">Trial feedback</EContinue>
    </Sequence>
  </section>
</template>
