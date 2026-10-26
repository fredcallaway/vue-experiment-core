<script setup lang="ts">
import { isTextInputFocused } from '../../utils/misc'
import { onKeyStroke, templateRef } from '@vueuse/core'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  compact?: boolean
  tutorialTitle?: string
  tutorialHelp?: string
}>(), {
  placeholder: 'e.g. foo* bar, baz !qux'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputRef = templateRef<HTMLInputElement>('input')

onKeyStroke('/', (event) => {
  if (isTextInputFocused()) return
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
  <TutorialTarget
    class="flex flex-col flex-gap-2 min-w-97 max-w-150"
    :title="props.tutorialTitle"
    :help="props.tutorialHelp"
    placement="left"
  >
    <div>
      <div class="text-sm text-gray-600 mb--1" v-if="!compact">
        Filter (<kbd>/</kbd>): space is AND, comma is OR, ! negates, * is wildcard
      </div>
      <input
        class="border border-2 px-3 py-1 box-border bg-white w-full"
        ref="input"
        v-model="searchQuery"
        type="text"
        :class="{ 'mt-2': !compact }"
        :placeholder="placeholder"
      />
    </div>
  </TutorialTarget>
</template>

