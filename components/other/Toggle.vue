<script setup lang="ts">
interface Props {
  modelValue: string | boolean
  trueValue?: string | boolean
  falseValue?: string | boolean
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  trueValue: true,
  falseValue: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | boolean]
}>()

const isChecked = computed(() => props.modelValue === props.trueValue)

const toggle = () => {
  const newValue = isChecked.value ? props.falseValue : props.trueValue
  emit('update:modelValue', newValue)
}
</script>

<template>
  <label class="flex items-center gap-2 cursor-pointer">
    <div
      class="relative w-11 h-6 rounded-full transition-colors"
      :class="isChecked ? 'bg-blue' : 'bg-gray-300'"
      @click="toggle"
    >
      <div
        class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform"
        :class="isChecked ? 'translate-x-5' : 'translate-x-0'"
      />
    </div>
    <span v-if="label || $slots.default">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

