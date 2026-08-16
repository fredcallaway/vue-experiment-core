<script lang="ts" setup>

// Between-subject assignment with useConditions. Main conditions iterate first;
// one counterbalance combination is held fixed for a complete pass through the
// main design. Conditions decide *which participant gets what*; they typically
// feed into params (see the params example).
//
// Reloading advances the assignment counter to the next variant. In /dev, the
// condition inspector lists these and lets you pin one; pinned values are written
// to `condition.<key>` URL params and excluded from the cycling counter.

const { isPinned, assign } = useConditions()

const conditions = assign({
  main: {
    reward: ['low', 'high'],
  },
  counterbalance: {
    layout: ['grid', 'list'],
    cueSide: ['left', 'right'],
  },
})

// Conditions feeding into behavior: e.g. pass to a trial's params.
const rewardPoints = computed(() => conditions.reward === 'high' ? 20 : 5)

// Show values in the Inspector panel in /dev (handy for derived state like this).
useInspect({ rewardPoints })

</script>

<template>
  <div p4>
    <EPage name="conditions" flex-col gap-4>
      <p text-sm text-gray-600>This session's assignment:</p>
      <table text-sm b-1 b-gray-200 rounded self-start>
        <thead bg-gray-50>
          <tr><th p2 text-left>key</th><th p2 text-left>assigned</th><th p2 text-left>pinned?</th></tr>
        </thead>
        <tbody>
          <tr b-t b-gray-100>
            <td p2><code>layout</code></td><td p2>{{ conditions.layout }}</td>
            <td p2>{{ isPinned.layout ? 'yes' : 'no' }}</td>
          </tr>
          <tr b-t b-gray-100>
            <td p2><code>reward</code></td><td p2>{{ conditions.reward }}</td>
            <td p2>{{ isPinned.reward ? 'yes' : 'no' }}</td>
          </tr>
          <tr b-t b-gray-100>
            <td p2><code>cueSide</code></td><td p2>{{ conditions.cueSide }}</td>
            <td p2>{{ isPinned.cueSide ? 'yes' : 'no' }}</td>
          </tr>
        </tbody>
      </table>
      <p text-xs text-gray-500>
        Derived: <code>rewardPoints = {{ rewardPoints }}</code>
      </p>
    </EPage>
  </div>
</template>
