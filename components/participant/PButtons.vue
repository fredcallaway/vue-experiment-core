<script lang="ts" setup>
const props = defineProps<{
  values: string | string[],
  classes?: string | string[],
  disabled?: boolean,
}>()

const values = computed(() =>
  Array.isArray(props.values) ? props.values : string2array(props.values)
)

const classes = computed(() =>
  Array.isArray(props.classes) ? props.classes :
  props.classes ? string2array(props.classes) :
  []
)

const emit = defineEmits<{
  (e: 'click', value: string): void
  (e: 'hover', value: string): void
  (e: 'mousedown', value: string): void
}>()

</script>

<template>
  <div class="flex justify-center gap-4 mx-auto">
    <PButton 
      v-for="(value, idx) in values" 
      :key="idx"
      :class="classes[idx]"
      :value="value"
      :disabled="disabled"
      @click="emit('click', $event)"
      @hover="emit('hover', $event)"
      @mousedown="emit('mousedown', $event)"
    />
  </div>
</template>
