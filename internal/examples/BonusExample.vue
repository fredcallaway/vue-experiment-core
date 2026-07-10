<script lang="ts" setup>

// useBonus is global state. Set centsPerPoint once (normally at the top of
// Experiment.vue), addPoints() from trials, and read the formatted getters for
// display. Every change logs a bonus.update event, and the dollar total is saved
// to the session meta, which determines the Prolific payment.

const bonus = useBonus()
bonus.centsPerPoint = 10

</script>

<template>
  <div p4>
    <ESequence name="main">

      <EPage name="earn" flex-col flex-center gap-4 v-slot="{ done }">
        <!-- The running bonus normally lives in a persistent block header. -->
        <div text-lg font-bold>Bonus: {{ bonus.dollarsString }}</div>
        <div text-sm text-gray-600>
          One point is worth {{ bonus.pointValueString }}
          ({{ bonus.pointsPerDollar }} points per dollar).
        </div>
        <div flex gap-2>
          <PButton value="+1 point" @click="bonus.addPoints(1)" />
          <PButton value="+5 points" @click="bonus.addPoints(5)" />
        </div>
        <PButton value="Done" color="gray" @click="done" />
      </EPage>

      <!-- A typical end-of-study reveal screen. -->
      <EContinue name="reveal" button="Finish" prompt>
        You earned {{ bonus.pointsString }}, for a bonus of <b>{{ bonus.dollarsString }}</b>.
      </EContinue>

      <EPage name="end" text-center>
        Done. <code>ECompletion</code> reports the saved bonus to Prolific.
      </EPage>

    </ESequence>
  </div>
</template>
