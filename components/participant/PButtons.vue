<script lang="ts" setup>
const props = defineProps<{
  values: string | string[],
  classes?: string | string[],
}>()

const values = 
  Array.isArray(props.values) ? props.values : 
  string2array(props.values)

const classes = 
  Array.isArray(props.classes) ? props.classes : 
  props.classes ? string2array(props.classes) : 
  []

const emit = defineEmits<{
  (e: 'click', value: string): void
  (e: 'hover', value: string): void
  (e: 'mousedown', value: string): void
}>()

</script>

<template>
  <div class="flex justify-center gap-2 mx-auto">
    <PButton 
      v-for="(value, idx) in values" 
      :key="idx"
      :class="classes[idx]"
      :value="value"
      @click="emit('click', $event)"
      @hover="emit('hover', $event)"
      @mousedown="emit('mousedown', $event)"
    />
  </div>
</template> 