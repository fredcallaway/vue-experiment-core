<script lang="ts" setup>
import stringify from "json-stringify-pretty-compact";

const { conditions, options, isPinned } = useConditions()

const conditionKeys = computed(() => Object.keys(options))

const formatValue = (value: unknown) => {
  if (typeof value === 'string') return value
  return stringify(value, { indent: 2, maxLength: 60 })
}
</script>

<template>
  <div
    v-if="conditionKeys.length > 0"
    border="~ 2 gray-300"
    p-2
    text-sm
    rounded-lg
    min-w="300px"
    flex="~ col"
    relative
  >
    <div flex="~ col gap-1" mb-2>
      <h2 shrink-0>Conditions</h2>
    </div>
    <div flex="~ col gap-1">
      <div v-for="key in conditionKeys" :key="key" flex="~ row items-center gap-2">
        <button
          @click.stop="isPinned[key] = !isPinned[key]"
          w-4
          h-4
          flex-center
          rounded
          class="group"
          hover:bg-gray-100
          :title="isPinned[key] ? 'Unpin' : 'Pin condition'"
        >
          <div v-if="isPinned[key]" i-mdi-pin text-blue-500 />
          <div v-else i-mdi-pin-outline text-gray-300 group-hover:text-gray-400 />
        </button>
        <span font-bold min-w="80px">{{ key }}:</span>
        <select
          v-model="conditions[key]"
          bg-white
          border="~ gray-300"
          rounded
          px-1
          text-xs
          min-w-0
          flex-1
          @change="isPinned[key] = true"
        >
          <option v-for="(value, index) in options[key]" :key="index" :value="value">
            {{ formatValue(value) }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>
