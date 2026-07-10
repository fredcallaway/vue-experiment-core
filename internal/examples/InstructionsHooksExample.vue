<script lang="ts" setup>
import CoinGame, { hooks, provideCoinGameParams } from './CoinGame.vue'

// Interactive instructions, strategy 2: the task runs continuously while an
// instruction sequence narrates it, synchronized through the task's hooks.
// Use this when the teaching moments happen *inside* the task's flow — you can
// pause the game mid-round, react to what the participant did, and even rig
// outcomes (a receive() callback may mutate the game state).
//
// The game is mounted `disabled`, detaching its epoch so the instruction
// sequence owns the epoch flow (the game's done() is ignored).

provideCoinGameParams({ rounds: 2, scored: false })

// Hooks are module-level; clear waiters left behind by an earlier visit (jump/HMR).
R.forEachObj(hooks, h => h.reset())

const started = ref(false)

// Pause gate: a beforeGuess receiver suspends the game (the game awaits the
// emit) until `paused` flips back to false.
const paused = ref(false)
const pauseUntilResumed = async () => {
  paused.value = true
  await until(paused).toBe(false)
}

</script>

<template>
  <div p4 flex-col gap-8>
    <CoinGame v-if="started" disabled />

    <ESequence name="instructions" text-center>

      <EContinue name="intro" prompt>
        On each round, a coin is hidden in one of two boxes. Let's play a practice
        round together.
      </EContinue>

      <!-- Rigged win: after the guess, move the coin to wherever they guessed. -->
      <EPage name="firstGuess" @mounted="(epoch) => {
        started = true
        hooks.afterGuess.receive((state) => {
          state.target = state.guess!
          epoch.done()
        })
      }">
        Pick a box: <kbd>F</kbd> (left) or <kbd>J</kbd> (right).
      </EPage>

      <!-- Advance when feedback has been shown, and pause the game before its
           next round so the next messages aren't rushed. -->
      <EPage name="firstFeedback" @mounted="async (epoch) => {
        hooks.beforeGuess.receive(pauseUntilResumed)
        await hooks.afterFeedback.receive()
        epoch.done()
      }" />

      <EContinue name="coin" delay="800">You found a coin!</EContinue>

      <EContinue name="worth" delay="800">
        Each coin is worth a bonus. But you won't always find one…
      </EContinue>

      <!-- Resume the game and rig a loss this time. -->
      <EPage name="secondGuess" @mounted="(epoch) => {
        paused = false
        hooks.afterGuess.receive((state) => {
          state.target = state.guess === 'left' ? 'right' : 'left'
          epoch.done()
        })
      }">
        Try again!
      </EPage>

      <EPage name="secondFeedback" @mounted="async (epoch) => {
        await hooks.afterFeedback.receive()
        epoch.done()
      }" />

      <EContinue name="final" button="Start" delay="800" prompt>
        Nothing that time. That's the game: guess the box, earn a bonus for every
        coin you find. Good luck!
      </EContinue>

    </ESequence>
  </div>
</template>
