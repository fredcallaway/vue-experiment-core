<script lang="ts" setup>

// Mouse tracking: mount <MouseTracker /> inside the epoch (or phase-sized
// component) you want tracked — one tracker at a time. Frames (x, y, t relative
// to the main content area) are saved under mouse/<startTime> in the session's
// "other" data, keyed to the epoch that mounted the tracker. Recording stops and
// saves automatically when the component unmounts.
//
// Prefer the component over calling useMouseTracking() directly; pass options
// like :max-frames only when the defaults need to change.

</script>

<template>
  <div class="p4">
    <ESequence name="main">

      <ERepeat name="trials" :count="2" v-slot="{ step }" class="flex-col gap-4">
        <!-- One tracker per trial epoch: each trial's trajectory is saved separately. -->
        <MouseTracker :max-frames="2_000" />
        <div class="text-sm text-gray-500 text-center">Trial {{ step + 1 }} / 2 — move the mouse, then continue</div>
        <EContinue name="trial" button="Next">
          <div class="w-60 h-40 b-2 b-dashed b-gray-300 rounded flex flex-wrap justify-center items-center">
            wiggle here
          </div>
        </EContinue>
      </ERepeat>

      <EPage class="text-center" name="end">
        Done. Trajectories are in the session's <code>other/mouse</code> data
        (visible in the session view on the Data page).
      </EPage>

    </ESequence>
  </div>
</template>
