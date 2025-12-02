<script lang="ts" setup>
const props = defineProps<{
  question: string
  options: string[]
}>()

const model = defineModel<string>()

</script>

<template>
<div>
  <h4>{{ question }}</h4>
  <div>
    <label v-for="option in options" :key="option">
      <input type="radio" v-model="model" :value="option" />
      {{ option }}
    </label>
  </div>
</div>
</template>