<script setup lang="ts">
import { logError } from '../../../../composables/logEvent'

const rootCount = ref(0)
</script>

<template>
  <section class="p6 text-center">
    <h1>Outline navigation fixture</h1>
    <p data-testid="root-count">Root count: {{ rootCount }}</p>
    <PButton value="Increment root" @click="rootCount++" />
    <PButton value="Log diagnostic" @click="logError('fixture diagnostic', new Error('expected'))" />
    <ESequence name="fixture">
      <ESequence name="nested">
        <EContinue name="opening" button="Begin blocks">Opening screen</EContinue>
        <ERepeat name="blocks" :count="2" v-slot="{ step: block }">
          <ESequence name="block">
            <EContinue name="intro" button="Begin trials">Block {{ block + 1 }} introduction</EContinue>
            <ERepeat name="trials" :count="2" v-slot="{ step: trial }">
              <OutlineTrial :block="block" :trial="trial" />
            </ERepeat>
          </ESequence>
        </ERepeat>
        <EContinue name="afterBlocks" button="Begin phases">Blocks finished</EContinue>
      </ESequence>
      <OutlinePhases />
      <OutlinePersistent />
      <OutlineAsync />
      <EContinue name="finish" button="Restart fixture">Fixture finished</EContinue>
    </ESequence>
  </section>
</template>
