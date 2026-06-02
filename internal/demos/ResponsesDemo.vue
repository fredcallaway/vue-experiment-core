<script lang="ts" setup>

// The "responses" tutorial. Collecting participant input — mouse and keyboard — is
// part of nearly every trial, but the pieces that do it are spread across components
// (PButton, PButtons, PContinue, PKey) and helpers (usePButton, onKeyPress,
// promiseKeyPress). This demo gathers them in one place, each on its own page.
//
// Two recurring patterns cut across both modalities:
//   - declarative: render a component and handle its @click/@press event, vs.
//   - script-side: await a typed response in script (usePButton().promise,
//     promiseKeyPress) — useful inside async trial logic.
//
// Since the simplified branch removed useParticipant, the template no longer blocks
// input during transitions. You gate it yourself — the last page shows the pattern.

// A script-side button: the template renders <StartButton/>, while script awaits its
// click. This is the EClickTest start-button pattern.
const StartButton = usePButton({ value: 'Start' })
const started = ref(false)
StartButton.promise('click').then(() => { started.value = true })

// A script-side key wait with reaction time. promiseKeyPress resolves on the next
// matching key; here we re-arm it each time so the page stays interactive.
const lastKey = ref<KeyPress | null>(null)
const armKeyWait = async () => {
  lastKey.value = await promiseKeyPress('F J')
  armKeyWait()
}
armKeyWait()

// A persistent listener with onKeyPress. It auto-unsubscribes on unmount, so no
// cleanup is needed. We just count how many times SPACE is pressed.
const spaceCount = ref(0)
onKeyPress('SPACE', () => { spaceCount.value++ })

// Gating during transitions: with no automatic input blocking, guard handlers with a
// flag (here a fake "animating" window) and disable the buttons while it's true.
const animating = ref(false)
const guardedChoice = ref<string | null>(null)
const onGuardedChoice = (value: string) => {
  if (animating.value) return // ignore input mid-transition
  guardedChoice.value = value
  animating.value = true
  setTimeout(() => { animating.value = false }, 800)
}

</script>

<template>
  <div w150 mx-auto p10>

    <!-- Everything lives inside the top-level (navigable) sequence, including the
         intro page — no content sits outside the epoch tree. -->
    <ENavigableSequence v-slot="{ enableNext }" header="Responses">

      <!-- ===================== Intro ===================== -->
      <EPage @mounted="enableNext" name="intro" flex-col gap-3>
        <h2 text-xl font-bold>Collecting responses</h2>
        <p>
          Mouse and keyboard input, declarative and script-side. Navigate with the
          buttons or arrow keys; each page is a self-contained example.
        </p>
      </EPage>

      <!-- ===================== PButton / PButtons ===================== -->
      <EPage @mounted="enableNext" name="buttons" v-slot="{ state }" flex-col gap-4>
        <div font-bold>Buttons</div>
        <p>
          <code>PButton</code> emits <code>@click</code> with its <code>value</code>;
          <code>PButtons</code> renders several from a space-separated list. Both take
          <code>:disabled</code>, and <code>once</code> removes a button after its
          first click.
        </p>
        <PButtons values="red green blue" @click="(v) => state.choice = v" />
        <div v-if="state.choice" text-green>You clicked <b>{{ state.choice }}</b>.</div>
      </EPage>

      <!-- ===================== usePButton (script-side) ===================== -->
      <EPage @mounted="enableNext" name="usePButton" flex-col gap-4>
        <div font-bold>Awaiting a button in script</div>
        <p>
          <code>usePButton(props)</code> returns a component <i>and</i> a
          <code>promise('click')</code> you can <code>await</code> in script — handy
          inside async trial logic, where the script wants to wait for a typed button
          event while the template renders it. This is how <code>EClickTest</code>'s
          start button works.
        </p>
        <StartButton />
        <div v-if="started" text-green>Script saw the click and resumed.</div>
      </EPage>

      <!-- ===================== PKey (declarative) ===================== -->
      <EPage @mounted="enableNext" name="pkey" v-slot="{ state }" flex-col gap-4>
        <div font-bold>Keys with PKey</div>
        <p>
          <code>PKey</code> listens for the given keys and emits <code>@press</code>
          with <code>{{ '{' }} key, rt {{ '}' }}</code> — reaction time included. It
          renders its slot while live; <code>once</code> stops after the first press.
        </p>
        <div text-sm text-gray-600>Press <kbd>F</kbd> or <kbd>J</kbd>.</div>
        <PKey keys="F J" @press="(kp) => state.press = kp" />
        <div v-if="state.press" text-green>
          Pressed <b>{{ state.press.key }}</b> ({{ Math.round(state.press.rt) }} ms).
        </div>
      </EPage>

      <!-- ===================== promiseKeyPress / onKeyPress (script-side) ===================== -->
      <EPage @mounted="enableNext" name="keys-script" flex-col gap-4>
        <div font-bold>Keys in script</div>
        <p>
          <code>promiseKeyPress('F J')</code> resolves on the next matching key (with
          RT) — the script-side counterpart to <code>PKey</code>. For a persistent
          listener, <code>onKeyPress(...)</code> registers a callback that
          auto-unsubscribes on unmount.
        </p>
        <div text-sm text-gray-600>Press <kbd>F</kbd>/<kbd>J</kbd>, or <kbd>Space</kbd>.</div>
        <div v-if="lastKey" text-green>
          promiseKeyPress: <b>{{ lastKey.key }}</b> ({{ Math.round(lastKey.rt) }} ms).
        </div>
        <div text-blue>onKeyPress: Space pressed {{ spaceCount }}×.</div>
      </EPage>

      <!-- ===================== Gating input ===================== -->
      <EPage @mounted="enableNext" name="gating" flex-col gap-4>
        <div font-bold>Gating input during transitions</div>
        <p>
          The template no longer blocks input automatically, so you guard it: keep a
          flag (here <code>animating</code>), ignore handler calls while it's set, and
          pass <code>:disabled</code> to the buttons. Click one — input is locked for a
          beat, then re-enabled.
        </p>
        <PButtons values="left right" :disabled="animating" @click="onGuardedChoice" />
        <div text-sm :class="animating ? 'text-orange' : 'text-gray-600'">
          {{ animating ? 'animating… (input ignored)' : `ready${guardedChoice ? ` — last: ${guardedChoice}` : ''}` }}
        </div>
      </EPage>

      <!-- ===================== PContinue ===================== -->
      <EPage name="continue" flex-col gap-4>
        <div font-bold>PContinue</div>
        <p>
          <code>PContinue</code> is the standard "advance" affordance: a button (with
          <code>button="…"</code>) or a space-key prompt by default. It calls
          <code>next()</code> on its parent epoch, so it lives inside an
          <code>EPage</code>. Here it finishes the demo.
        </p>
        <PContinue button="Finish" />
      </EPage>

    </ENavigableSequence>
  </div>
</template>
