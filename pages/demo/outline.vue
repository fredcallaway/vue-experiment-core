<script lang="ts" setup>

// The epoch outline (visible in the /dev panel) is a live tree of every epoch in
// the experiment. It is built lazily as epochs mount, which matters when an
// ERepeat's children are *not* structurally identical across iterations: the
// outline only learns an iteration's shape once that iteration has run.
//
// This page demonstrates that case — iteration 3 mounts an extra ESequence that
// the other iterations don't. Open /dev and watch the outline panel update as
// you advance through the repeat.

const currentEpoch = useCurrentEpoch()

</script>

<template>
  <div w150 mx-auto p10 flex-col gap-6>

    <div>
      <h2 text-xl font-bold>Epoch outline &amp; dynamic structure</h2>
      <p mt-2>
        The outline (in the <code>/dev</code> panel) is a live tree of all
        epochs, built as they mount. When an <code>ERepeat</code>'s children
        differ across iterations, the outline fills in each iteration's shape
        only once it runs.
      </p>
      <p mt-1 text-sm text-gray-600>
        Root epoch: <code>{{ currentEpoch.id }}</code> — advance through the
        repeat below and watch the outline grow.
      </p>
    </div>

    <ERepeat name="DemoOutline" :count="4" v-slot="{ step }"
             class="flex-col gap-4 min-h-40 b-1 b-gray-200 rounded p6">
      <div text-sm text-gray-600>Iteration {{ step + 1 }} / 4</div>

      <!-- Iteration index 2 (the 3rd) has a different internal structure (an
           extra ESequence) than the others. The outline can't predict this; it
           discovers the branch when step === 2 actually mounts. -->
      <div v-if="step == 2" flex-col gap-3>
        <div>Oh my goodness, I didn't see this coming!</div>
        <ESequence name="surpriseSequence">
          <EContinue button="much surprise" />
          <EContinue button="very unexpect " />
        </ESequence>
      </div>
      <div v-else flex-col gap-3>
        everything is going according to plan...
        <EContinue button />
      </div>
    </ERepeat>
  </div>
</template>
