<script lang="ts" setup>

// Between-subject assignment with useConditions. choice() assigns one value per
// key for this session; permute() assigns an ordering. Assignment cycles across
// sessions so variants stay balanced. Conditions decide *which participant gets
// what*; they typically feed into params (see the params example).
//
// In /dev, the condition inspector lists these and lets you pin one; pinned values
// are written to `condition.<key>` URL params and excluded from the cycling counter.

const { isPinned, choice, permute } = useConditions()

const conditions = choice({
  layout: ['grid', 'list'],
  reward: ['low', 'high'],
})
const cueOrder = permute('cueOrder', ['A', 'B', 'C'])

// Conditions feeding into behavior: e.g. pass to a trial's params.
const rewardPoints = computed(() => conditions.reward === 'high' ? 20 : 5)

// Show values in the Inspector panel in /dev (handy for derived state like this).
useInspect({ rewardPoints })

</script>

<template>
  <div p4>
    <EPage name="conditions" flex-col gap-4>
      <p text-sm text-gray-600>
        This session's assignment. Reload to advance the assignment counter, or pin a
        condition from the inspector in <NuxtLink to="/dev">/dev</NuxtLink>.
      </p>
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
            <td p2><code>cueOrder</code></td><td p2>{{ cueOrder.join(', ') }}</td>
            <td p2>{{ isPinned.cueOrder ? 'yes' : 'no' }}</td>
          </tr>
        </tbody>
      </table>
      <p text-xs text-gray-500>
        Derived: <code>rewardPoints = {{ rewardPoints }}</code>
        (e.g. <code>:params="{ points: rewardPoints }"</code>)
      </p>
    </EPage>
  </div>
</template>
