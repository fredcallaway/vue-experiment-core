<script lang="ts" setup>

// Standard instructions: ENavigableSequence gives Back/Next controls (and arrow
// keys) so participants can re-read pages. Finishing a page is decoupled from
// advancing — Next stays locked until the page calls the slot's enableNext.
//
// For instructions where the participant interacts with the real task, see the
// instructions-embedded / instructions-hooks / instructions-ref examples.

</script>

<template>
  <div p4>
    <ENavigableSequence v-slot="{ enableNext }" header="Instructions">

      <!-- A pure reading page unlocks Next on mount. -->
      <EPage @mounted="enableNext" name="welcome" flex-col gap-3>
        <p class="prompt">
          Welcome! Navigate with the arrow keys or the buttons above. Earlier pages
          stay available so you can re-read them.
        </p>
      </EPage>

      <!-- A page requiring an action calls enableNext only once it's done.
           `state` is EPage's per-page reactive scratch object. -->
      <EPage name="choice" v-slot="{ state }" flex-col gap-3>
        <p class="prompt">Next unlocks after you pick an option.</p>
        <PButtons values="left right"
                  :disabled="R.isDefined(state.choice)"
                  @click="(val) => { state.choice = val; enableNext() }" />
        <div v-if="state.choice" text-green>You chose {{ state.choice }}.</div>
      </EPage>

      <!-- The last child finishing finishes the whole sequence, like ESequence. -->
      <EContinue name="ready" button="Start">
        That's the end of the instructions.
      </EContinue>

    </ENavigableSequence>
  </div>
</template>
