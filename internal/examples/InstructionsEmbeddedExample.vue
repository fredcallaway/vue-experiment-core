<script lang="ts" setup>
import CoinGame from './CoinGame.vue'

// Interactive instructions, strategy 1: embed the real task as a practice block.
// The task component is simply a child epoch with practice params (short,
// unscored); the participant plays it for real and the sequence advances when it
// finishes. Simplest strategy — use it when playing a round or two unassisted is
// enough to teach the task.
//
// A plain ESequence (not ENavigableSequence) because back-navigating into an
// embedded task remounts it mid-game.

</script>

<template>
  <div p4>
    <ESequence name="main">

      <EContinue name="intro" prompt>
        On each round, a coin is hidden in one of two boxes. Guess where it is with
        <kbd>F</kbd> (left) or <kbd>J</kbd> (right). Let's try a couple of practice
        rounds — they don't count.
      </EContinue>

      <!-- The real task, configured as practice. -->
      <CoinGame :params="{ rounds: 2, scored: false }" mt6 />

      <EContinue name="ready" button="Start" prompt>
        Got it? In the real game, every coin you find is worth a bonus.
      </EContinue>

      <EPage name="end" text-center>
        (Here the real, scored game would run: <code>&lt;CoinGame /&gt;</code>.)
      </EPage>

    </ESequence>
  </div>
</template>
