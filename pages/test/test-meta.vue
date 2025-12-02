<script lang="ts" setup>

// import {  useConditions, useBonus } from '#imports'

const meta = useCurrentSession()
const { conditions, choice } = useConditions()

const { color } = choice({
  color: ['red', 'green', 'blue'],
})

const bonus = useBonus()

onMounted(async () => {
  await timeoutPromise(1000)
  bonus.addPoints(10)

  choice({ number: [1, 2, 3] })
  await timeoutPromise(1000)
  await timeoutPromise(1000)
  conditions.number = 5
})


</script>

<template>
  <div p-10>
    <div :style="{ color }" text-lg mb3>
      {{ color }}
    </div>
    <pre>{{ meta }}</pre>
  </div>
</template>