<script lang="ts">
import ProbeTrial, { provideProbeParams } from './ProbeTrial.vue'

// ProbeTrial defines the module defaults. This example adds two more layers:
//   - assigned conditions provide params for the whole subtree
//   - a component's params prop overrides individual values for one instance

</script>

<script lang="ts" setup>

const { assign, isPinned } = useConditions()
const conditions = assign({
  main: {
    probeColor: ['steelblue', 'tomato'],
  },
  counterbalance: {
    probeSize: [60, 100],
  },
})

// Conditions usually affect behavior by feeding params. Every ProbeTrial below
// inherits this participant's assignment unless its params prop overrides it.
provideProbeParams({
  color: conditions.probeColor,
  size: conditions.probeSize,
})

</script>

<template>
  <div p4>
    <EPage name="configuration" flex-col gap-8>
      <div flex-col gap-2>
        <p text-sm text-gray-600>This session's assigned configuration:</p>
        <table text-sm b-1 b-gray-200 rounded self-start>
          <thead bg-gray-50>
            <tr><th p2 text-left>key</th><th p2 text-left>assigned</th><th p2 text-left>pinned?</th></tr>
          </thead>
          <tbody>
            <tr b-t b-gray-100>
              <td p2><code>probeColor</code></td><td p2>{{ conditions.probeColor }}</td>
              <td p2>{{ isPinned.probeColor ? 'yes' : 'no' }}</td>
            </tr>
            <tr b-t b-gray-100>
              <td p2><code>probeSize</code></td><td p2>{{ conditions.probeSize }}</td>
              <td p2>{{ isPinned.probeSize ? 'yes' : 'no' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div flex gap-8 items-end justify-center>
        <ProbeTrial />
        <ProbeTrial :params="{ color: 'seagreen' }" />
        <ProbeTrial :params="{ color: 'goldenrod', size: 80 }" />
      </div>

      <p text-xs text-gray-500>
        Assigned subtree params, then a color override, then color and size overrides.
      </p>
    </EPage>
  </div>
</template>
