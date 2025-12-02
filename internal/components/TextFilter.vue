<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
}>(), {
  placeholder: 'e.g. foo* bar, baz !qux'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputRef = templateRef<HTMLInputElement>('input')

onKeyStroke('/', (event) => {
  event.preventDefault()
  event.stopPropagation()
  inputRef.value?.focus()
})
onKeyStroke('Escape', (event) => {
  if (inputRef.value !== document.activeElement) return
  searchQuery.value = ''
  event.preventDefault()
  event.stopPropagation()
  inputRef.value?.blur()
})

const searchQuery = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})
</script>

<template>
  <div flex="~ col gap-2" min-w-97 max-w-150>
    <div>
      <div text-sm text-gray-600 mb--1>
        Filter (<kbd>/</kbd>): space is AND, comma is OR, ! negates, * is wildcard
      </div>
      <input
        ref="input"
        v-model="searchQuery"
        type="text"
        input
        w-full
        mt-2
        :placeholder="placeholder"
      />
    </div>
  </div>
</template>

