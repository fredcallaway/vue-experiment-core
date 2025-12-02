<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  class?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isEditing = ref(false)
const inputRef = ref<HTMLInputElement>()

const startEdit = () => {
  isEditing.value = true
  nextTick(() => {
    inputRef.value?.focus()
  })
}

const saveEdit = () => {
  isEditing.value = false
}

const handleInput = (e: Event) => {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    saveEdit()
  }
}

const clipEnd = (str: string, maxLength: number) => {
  return str.length > maxLength ? str.slice(0, maxLength) + '...' : str
}
const clipStart = (str: string, maxLength: number) => {
  return str.length > maxLength ? '...' + str.slice(-maxLength) : str
}
</script>

<template>
  <input 
    v-if="isEditing"
    :value="modelValue"
    @input="handleInput"
    @blur="saveEdit"
    @keydown="handleKeydown"
    :class="props.class"
    class="bg-gray-100 rounded outline-none border-none px-1 w-full text-gray-800"
    ref="inputRef"
  />
  <div 
    v-else
    @click="startEdit"
    :class="props.class"
    class="cursor-pointer hover:bg-gray-100 rounded px-1"
  >
    {{ clipStart(modelValue, 22) }}
  </div>
</template>

