<script lang="ts" setup>
import PeekGame, { providePeekGameParams } from './PeekGame.vue'

// Interactive instructions, the preferred pattern: mount the task once
// (`manual no-epoch`, below the sequence) and script each page against its
// exposed surface — playRound() for rigged demonstration rounds, allowGuess to
// hold input until a teaching moment, reactive `state` + `until` to await and
// narrate what the participant does. Free practice embeds real PeekGame epochs
// instead (`practicing` hides the manual instance), and a comprehension quiz
// gates the exit.
//
// A plain ESequence, not ENavigableSequence: pages that drive a live task
// don't tolerate back-navigation (their @mounted scripts would re-run).

providePeekGameParams({ scored: false })

const { Sequence } = useESequence('instructions')

const game = useTemplateRef('game')
const practicing = ref(false)

// Comprehension quiz: retry until correct. For a stricter gate, a wrong answer
// could instead restart the instructions with useESequence's E.goTo(0).
const quiz = [
  {
    prompt: 'What happens when you press SPACE?',
    options: ['you guess the left box', 'you pay 1 point to see a hint', 'the round ends'],
    answer: 'you pay 1 point to see a hint',
  },
  {
    prompt: 'The hint marks the box where the coin…',
    options: ['always is', 'usually is', 'never is'],
    answer: 'usually is',
  },
]
const quizStep = ref(0)
const quizWrong = ref(false)
const answerQuiz = (option: string, done: () => void) => {
  quizWrong.value = option !== quiz[quizStep.value].answer
  if (quizWrong.value) return
  if (quizStep.value === quiz.length - 1) done()
  else quizStep.value++
}

</script>

<template>
  <div flex-col gap-8 text-center>
    <Sequence>

      <EContinue name="welcome" prompt>
        In this game, a coin is hidden in one of the two boxes below.
        Find it and it's yours: every coin is worth 2 points.
      </EContinue>

      <!-- A demonstration round the page owns: rig the coin's side so the
           narration on the next page can refer to it. -->
      <EPage name="firstRound" prompt @mounted="async (epoch) => {
        await game!.playRound({ target: 'left' })
        epoch.done()
      }">
        Take a guess: press <kbd>F</kbd> (left) or <kbd>J</kbd> (right).
      </EPage>

      <EContinue name="firstFeedback" delay="600" prompt>
        The coin was on the left{{ game!.state.correct ? ' — nice guess!' : ' that time.' }}
        A correct guess earns 2 points; a wrong one earns nothing.
      </EContinue>

      <EContinue name="peekIntro" prompt>
        You don't have to guess blindly: before guessing, you can <b>peek</b>
        for the cost of 1 point.
      </EContinue>

      <!-- One round spanning two pages: this page starts it (not awaited) with
           guessing disabled, and advances once the participant peeks. -->
      <EPage name="peek" prompt @mounted="(epoch) => {
        game!.allowGuess = false
        void game!.playRound({ target: 'right', hintValid: true })
        until(() => game!.state.peeked).toBe(true).then(() => epoch.done())
      }">
        Try it now: press <kbd>SPACE</kbd>.
      </EPage>

      <!-- …and this page re-enables guessing and waits for the round to end. -->
      <EPage name="peekGuess" prompt @mounted="(epoch) => {
        game!.allowGuess = true
        until(() => game!.state.phase).toBe('feedback').then(() => epoch.done())
      }">
        The ⭐ is a hint: it marks the box where the coin <i>usually</i> is.
        Make your guess.
      </EPage>

      <EContinue name="peekFeedback" delay="600" prompt>
        That hint was honest, but hints lie some of the time — follow them at
        your own risk.
      </EContinue>

      <EContinue name="practiceIntro" prompt @mounted="practicing = true">
        Let's practice. Three rounds, on the house — points don't count yet.
      </EContinue>

      <!-- Free practice: real PeekGame epochs (unscored via the provide above). -->
      <ERepeat name="practice" :count="3" v-slot="{ step, nSteps }" class="flex-col gap-2">
        <div text-sm text-gray-500>Practice {{ step + 1 }} / {{ nSteps }}</div>
        <PeekGame />
      </ERepeat>

      <EPage name="quiz" v-slot="{ done }" flex-col gap-4>
        <p class="prompt">
          Quick check ({{ quizStep + 1 }} / {{ quiz.length }}):
          {{ quiz[quizStep].prompt }}
        </p>
        <PButtons :values="quiz[quizStep].options" class="gap-2" @click="(v) => answerQuiz(v, done)" />
        <div v-if="quizWrong" text-red>Not quite — think back to the practice rounds.</div>
      </EPage>

      <EContinue name="ready" button="Start" prompt>
        You're ready! From here on, the points are real.
      </EContinue>

    </Sequence>

    <!-- The instructable instance: mounted from the start, inert until a page
         drives it; hidden during the embedded practice block. -->
    <PeekGame v-if="!practicing" ref="game" manual no-epoch />
  </div>
</template>
