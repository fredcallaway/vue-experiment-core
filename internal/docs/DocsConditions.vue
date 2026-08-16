<script lang="ts" setup>
import { getConditionAssignmentCount, getConditionsForAssignment } from '../../utils/conditions'
import DocsPage from './DocsPage.vue'

const design = {
  main: {
    treatment: ['control', 'treatment'],
  },
  counterbalance: {
    taskOrder: ['AB', 'BA'],
    responseSide: ['left', 'right'],
  },
} as const

const assignments = Array.from({ length: getConditionAssignmentCount(design) }, (_, assignment) => ({
  assignment,
  ...getConditionsForAssignment(assignment, design),
}))
</script>

<template>
  <DocsPage name="conditionAssignment">
    <h2>Condition assignment</h2>
    <p>
      Declare experimental manipulations as <code>main</code> conditions and nuisance variables such as task order or
      response mapping as <code>counterbalance</code> conditions.
    </p>
    <pre bg-gray-50 b="1 gray-200" rounded p3 text-sm overflow-x-auto><code>const conditions = useConditions().assign({
  main: {
    treatment: ['control', 'treatment'],
  },
  counterbalance: {
    taskOrder: ['AB', 'BA'],
    responseSide: ['left', 'right'],
  },
})</code></pre>
    <div
      mt-1
      h-56
      max-w-full
      overflow-auto
      b="1 gray-200"
      rounded
      tabindex="0"
      aria-label="Generated condition assignments"
    >
      <table text-sm min-w-120 w-full>
        <thead sticky top-0 z-1 bg-gray-50>
          <tr>
            <th p2 text-left>Assignment</th>
            <th p2 text-left>Treatment</th>
            <th p2 text-left>Task order</th>
            <th p2 text-left>Response side</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in assignments" :key="row.assignment" b-t="1 gray-100">
            <td p2>{{ row.assignment }}</td>
            <td p2>{{ row.treatment }}</td>
            <td p2>{{ row.taskOrder }}</td>
            <td p2>{{ row.responseSide }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- <p>
      This table is generated with <code>getConditionsForAssignment()</code>, the same pure helper used by
      <code>useConditions().assign()</code>. The table therefore changes with the implementation instead of duplicating
      its expected output.
    </p> -->
    <p>
      We iterate through all "main" conditions before selecting another counterbalance
      combination. We iterate through "counterbalance" combinations to minimize marginal imbalance in case
      you don't run enough participants to cover all possible combinations.
      The assignment index is taken from a URL parameter; this is handled automatically by our prolific interface.
    </p>
  </DocsPage>
</template>
