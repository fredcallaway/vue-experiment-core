<script lang="ts" setup>
import stringify from "json-stringify-pretty-compact";

const { conditions, options, selectedIndices, setConditionIndex } = useConditions()

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
    <div flex="~ col gap-2">
      <label v-for="key in conditionKeys" :key="key" card-gray p-2 mr-1 rounded-md flex="~ col gap-1">
        <span font-bold>{{ key }}</span>
        <select
          :value="selectedIndices[key]"
          bg-white
          border="~ gray-300"
          rounded
          p-1
          text-xs
          @change="setConditionIndex(key, Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="(value, index) in options[key]" :key="index" :value="index">
            {{ formatValue(value) }}
          </option>
        </select>
        <pre text-xs opacity-60 class="whitespace-pre-wrap break-words">{{ formatValue(conditions[key]) }}</pre>
      </label>
    </div>
  </div>
</template>
