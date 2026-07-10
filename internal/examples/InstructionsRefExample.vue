<script lang="ts" setup>
import CoinGame from './CoinGame.vue'

// Interactive instructions, strategy 3: drive the task imperatively through a
// template ref. The task is mounted `manual no-epoch` — outside the epoch flow,
// running no rounds on its own — and instruction pages call its exposed
// playRound() (awaiting the result) exactly when the script calls for it.
// Use this when the instructions need fine-grained control over what the task
// does on each page (forced outcomes, single steps, partial rounds).

const game = useTemplateRef('game')

</script>

<template>
  <div p4 flex-col gap-8>

    <ESequence name="instructions" text-center>

      <EContinue name="intro" prompt>
        On each round, a coin is hidden in one of two boxes. Let's walk through it.
      </EContinue>

      <!-- The page owns the round: rig the coin to the left, resolve on feedback. -->
      <EPage name="rigged" @mounted="async (epoch) => {
        await game!.playRound('left')
        epoch.done()
      }">
        Guess where the coin is: <kbd>F</kbd> (left) or <kbd>J</kbd> (right).
      </EPage>

      <EContinue name="explain" delay="600" prompt>
        It was on the left that time
        ({{ game!.state.correct ? 'nice guess!' : 'better luck next round' }}).
        Now a real one — no tricks.
      </EContinue>

      <EPage name="random" @mounted="async (epoch) => {
        await game!.playRound()
        epoch.done()
      }">
        Where is it this time?
      </EPage>

      <EContinue name="final" button="Start" prompt>
        That's the game. Every coin you find earns a bonus. Good luck!
      </EContinue>

    </ESequence>

    <!-- Mounted from the start, inert until a page drives it. -->
    <CoinGame ref="game" manual no-epoch :params="{ scored: false }" />

  </div>
</template>
