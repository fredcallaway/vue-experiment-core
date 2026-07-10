<script lang="ts" setup>

// Collecting participant input. Two modalities (buttons, keys), each usable two
// ways: declaratively (a component + @event) or script-side (await a promise
// inside async trial logic).
//
// The template does not block input during transitions — gate handlers yourself
// with a phase/animating flag and :disabled (see the last page).

// Script-side button: the template renders <StartButton/>, the script awaits it.
const StartButton = usePButton({ value: 'Start' })
const started = ref(false)
StartButton.promise('click').then(() => { started.value = true })

// Script-side key wait (re-armed each time so the page stays interactive).
const lastKey = ref<KeyPress | null>(null)
const armKeyWait = async () => {
  lastKey.value = await promiseKeyPress('F J')
  armKeyWait()
}
armKeyWait()

// Persistent listener; auto-unsubscribes on unmount.
const spaceCount = ref(0)
onKeyPress('SPACE', () => { spaceCount.value++ })

// Gating input during a transition.
const animating = ref(false)
const onGuardedChoice = (value: string) => {
  if (animating.value) return
  animating.value = true
  setTimeout(() => { animating.value = false }, 800)
}

</script>

<template>
  <div p4>
    <ENavigableSequence v-slot="{ enableNext }" header="Responses">

      <!-- PButton emits @click with its value; PButtons renders several from a
           list (space, comma, or | separated). `once` removes it after one click. -->
      <EPage @mounted="enableNext" name="buttons" v-slot="{ state }" flex-col gap-4>
        <div font-bold>Buttons (declarative)</div>
        <PButtons values="red green blue" @click="(v) => state.choice = v" />
        <div v-if="state.choice" text-green>You clicked <b>{{ state.choice }}</b>.</div>
      </EPage>

      <!-- usePButton returns a component the template renders while the script
           awaits its .promise('click') — for buttons inside async trial logic. -->
      <EPage @mounted="enableNext" name="scriptButton" flex-col gap-4>
        <div font-bold>Buttons (script-side)</div>
        <StartButton />
        <div v-if="started" text-green>Script saw the click and resumed.</div>
      </EPage>

      <!-- PKey emits @press with { key, rt }; `once` stops after the first press. -->
      <EPage @mounted="enableNext" name="keys" v-slot="{ state }" flex-col gap-4>
        <div font-bold>Keys (declarative)</div>
        <div text-sm text-gray-600>Press <kbd>F</kbd> or <kbd>J</kbd>.</div>
        <PKey keys="F J" @press="(kp) => state.press = kp" />
        <div v-if="state.press" text-green>
          Pressed <b>{{ state.press.key }}</b> ({{ Math.round(state.press.rt) }} ms).
        </div>
      </EPage>

      <!-- promiseKeyPress resolves on the next matching key; onKeyPress registers
           a persistent callback. Both return/receive { key, rt }. -->
      <EPage @mounted="enableNext" name="scriptKeys" flex-col gap-4>
        <div font-bold>Keys (script-side)</div>
        <div text-sm text-gray-600>Press <kbd>F</kbd>/<kbd>J</kbd>, or <kbd>Space</kbd>.</div>
        <div v-if="lastKey" text-green>
          promiseKeyPress: <b>{{ lastKey.key }}</b> ({{ Math.round(lastKey.rt) }} ms).
        </div>
        <div text-blue>onKeyPress: Space pressed {{ spaceCount }}×.</div>
      </EPage>

      <!-- Guard the handler AND disable the buttons while transitioning. -->
      <EPage @mounted="enableNext" name="gating" flex-col gap-4>
        <div font-bold>Gating input</div>
        <PButtons values="left right" :disabled="animating" @click="onGuardedChoice" />
        <div text-sm :class="animating ? 'text-orange' : 'text-gray-600'">
          {{ animating ? 'animating… (input ignored)' : 'ready' }}
        </div>
      </EPage>

      <!-- EContinue is an epoch, not an input component: it advances its own epoch
           on space (default) or a button. Use it for "read this, then continue". -->
      <EContinue name="continue" button="Finish" flex-col gap-4>
        <div font-bold>EContinue</div>
        <p>Finishes this example via its own button.</p>
      </EContinue>

    </ENavigableSequence>
  </div>
</template>
