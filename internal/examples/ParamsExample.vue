<script lang="ts">
import ProbeTrial, { provideProbeParams } from './ProbeTrial.vue'

// defineParams gives a component typed, defaulted settings. Overrides come from
// two directions:
//   - per instance, via the `params` prop (closest to the component wins)
//   - for a whole subtree, via provideXParams() in an ancestor's setup
// Params shape *this render*; for between-subject variants see the conditions example.

</script>

<script lang="ts" setup>

// A subtree-wide override: every ProbeTrial below this component defaults to
// size 60 unless its own `params` prop overrides it again.
provideProbeParams({ size: 60 })

</script>

<template>
  <div p4>
    <EPage name="params" flex-col gap-8>
      <p text-sm text-gray-600>
        The same component rendered three times. Module defaults, then the
        subtree-wide <code>provideProbeParams({ size: 60 })</code>, then per-instance
        <code>:params</code> overrides — later layers win.
      </p>
      <div flex gap-8 items-end justify-center>
        <ProbeTrial />
        <ProbeTrial :params="{ color: 'tomato' }" />
        <ProbeTrial :params="{ color: 'seagreen', size: 100 }" />
      </div>
    </EPage>
  </div>
</template>
