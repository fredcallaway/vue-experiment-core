<script lang="ts" setup>

const currentEpoch = useCurrentEpoch()

defineWindowSize({
  width: 600,
  height: 800,
})

</script>

<template>
  <div p4>
    <ESequence name="devtools">

      <EPage name="intro">
        <h2>Devtools</h2>
        The <code>/dev</code> panel gives you tools for building and debugging an
        experiment: controls for moving around, a live outline of the epoch tree,
        and an error boundary that keeps a single bug from stranding the
        participant. This tutorial walks through each.
        <PContinue/>
      </EPage>

      <EPage name="controls">
        <h2>Controls</h2>
        These are the controls. You can...
        left/right
        pinning
        fast mode

        <div flex-center my4>
          <EpochControls max-w-40 />
        </div>
        <PContinue />
      </EPage>

      <!-- The outline is a live tree of every epoch in the experiment. It shows
           you the full structure and lets you jump around it. -->
      <ESequence name="outline">

        <EPage name="intro">
          <h2>Outline</h2>

          This is the outline. It shows you the full structure of the experiment.
          You can click ... TODO

          <div flex-center my4>
            <EpochOutline max-w-60 max-h-70 />
          </div>

          <ESequence name="example_sequence">
            <EPage name="a"><PContinue button /></EPage>
            <EPage name="b"><PContinue button /></EPage>
            <EPage name="c"><PContinue button /></EPage>
          </ESequence>
        </EPage>

        <!-- The outline is built lazily as epochs mount, which matters when an
             ERepeat's children are *not* structurally identical across iterations:
             the outline only learns an iteration's shape once that iteration has
             run. Iteration 3 below mounts an extra ESequence that the others don't.
             Open /dev and watch the outline panel update as you advance. -->
        <EPage name="dynamic">
          <h2>Dynamic structure</h2>
          <p mt-2>
            The outline is built as epochs mount. When an <code>ERepeat</code>'s
            children differ across iterations, the outline fills in each
            iteration's shape only once it runs. Advance through the repeat below
            and watch the outline grow.
          </p>

          <ERepeat name="DemoOutline" :count="4" v-slot="{ step }"
                   class="flex-col gap-4 min-h-40 b-1 b-gray-200 rounded p6 mt-4">
            <div text-sm text-gray-600>Iteration {{ step + 1 }} / 4</div>

            <!-- Iteration index 2 (the 3rd) has a different internal structure (an
                 extra ESequence) than the others. The outline can't predict this;
                 it discovers the branch when step === 2 actually mounts. -->
            <div v-if="step == 2" flex-col gap-3>
              <div>Oh my goodness, I didn't see this coming!</div>
              <ESequence name="surpriseSequence">
                <EPage name="surprise"><PContinue button="much surprise" /></EPage>
                <EPage name="unexpect"><PContinue button="very unexpect " /></EPage>
              </ESequence>
            </div>
            <div v-else flex-col gap-3>
              everything is going according to plan...
              <EPage><PContinue button /></EPage>
            </div>
          </ERepeat>
        </EPage>
      </ESequence>

      <!-- Experiment content runs inside an error boundary (see MainContent's
           `capture-errors`). When any epoch throws, the boundary catches it, logs
           the error, and shows a fallback instead of a blank screen — so a bug in
           one trial doesn't silently strand the participant. -->
      <ESequence name="error">

        <EPage name="intro">
          <h2>Error handling</h2>
          <p mt-2>
            Epoch content runs inside an error boundary. When an epoch throws, the
            error is logged and a fallback is shown instead of a broken page. Click
            through below to trigger one on purpose with <code>throwError</code>.
          </p>
          <p mt-1 text-sm text-gray-600>
            <code>throwError</code> is the helper for raising an error from within
            an epoch. In real code you won't call it yourself; unexpected exceptions
            are caught the same way.
          </p>
          <PContinue/>
        </EPage>

        <ESequence name="demo" flex-center flex-col gap-4 min-h-30 b-1 b-gray-200 rounded p6>
          <EPage name="PreError">
            The next page will throw an error.
            <PContinue button/>
          </EPage>
          <!-- Throwing on mount simulates a bug in a trial. The boundary catches
               it, logs it, and renders the fallback in place of this content. -->
          <EPage name="brokenPage" @mounted="throwError('Test error. Please ignore')" />
        </ESequence>
      </ESequence>

      <!-- TODO: event view -->
    </ESequence>
  </div>
</template>

<style>

.navigable-sequence .prompt {
  color: red !important;
}

</style>
