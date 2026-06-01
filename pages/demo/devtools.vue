<script lang="ts" setup>

const currentEpoch = useCurrentEpoch()
defineWindowSize({
  width: 600,
  height: 800,
})

</script>

<template>
  <div p4>
    <ESequence name=devtools>
      <EPage name=controls>
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

      <EPage name=outline>
        <h2>Outline</h2>

        This is the outline. It shows you the full structure of the experiment.
        You can click ... TODO

        <div flex-center my4>
          <EpochOutline max-w-60 max-h-70 />
        </div>

        <ESequence name=example_sequence>
          <EPage name=a><PContinue button /></EPage>
          <EPage name=b><PContinue button /></EPage>
          <EPage name=c><PContinue button /></EPage>
        </ESequence>
      </EPage>

      <!-- TODO: event view -->
    </ESequence>
  </div>
</template>

<style>

.navigable-sequence .prompt {
  color: red !important;
}

</style>