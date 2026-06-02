<script lang="ts" setup>

// ENavigableSequence is like ESequence, but the participant can move back and
// forth between children using the Back/Next controls it renders at the top.
// This is the standard way to present instructions: people can re-read pages.
//
// Because participants navigate freely, "finishing" a page is decoupled from
// advancing. Use the slot's `enableNext` to unlock the Next control only after
// the participant has done what a page requires (read it, made a choice, etc.).
// Next stays disabled until the current (or a later) page has called enableNext.

</script>

<template>
  <div w150 mx-auto p10>

    <!-- `header` labels the nav controls ("Instructions 1 of 3"). The slot
         exposes `enableNext`; until a page calls it, the Next control is
         disabled, so participants can't skip ahead. -->
    <ENavigableSequence v-slot="{ enableNext }" header="Instructions"
                        class="b-1 b-gray-200 rounded p6 min-h-60">

      <!-- A pure reading page can enable Next as soon as it mounts. -->
      <EPage @mounted="enableNext" name="welcome" flex-col gap-3>
        <h2 text-xl font-bold>ENavigableSequence</h2>
        <p>
          A sequence the participant can navigate with Back/Next (or the arrow
          keys) — use it for instructions. Call <code>enableNext</code> from a page
          to unlock the Next button once the page's requirement is met.
        </p>
        <div>
          Navigate with the arrow keys or the buttons above. Try going Back and
          Next — earlier pages stay available so participants can re-read them.
        </div>
      </EPage>

      <!-- A page can require an action before unlocking Next. Here, Next stays
           disabled until the participant makes a choice. `state` is EPage's
           built-in per-page reactive scratch object. -->
      <EPage name="choice" v-slot="{ state }" flex-col gap-3>
        <div font-bold>Make a choice</div>
        <div>Next is disabled until you pick an option.</div>
        <PButtons values="left right"
                  :disabled="R.isDefined(state.choice)"
                  @click="(val) => { state.choice = val; enableNext() }" />
        <div v-if="state.choice" text-green>You chose {{ state.choice }}.</div>
      </EPage>

      <!-- The final page. Finishing a navigable sequence works like ESequence:
           the last child completing finishes the whole thing. -->
      <EPage name="ready">
        <div font-bold>Ready</div>
        That's the end of the instructions.
        <PContinue button="Start"/>
      </EPage>

    </ENavigableSequence>
  </div>
</template>
