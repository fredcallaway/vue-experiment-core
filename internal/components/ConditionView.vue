<script lang="ts" setup>
import { useConditions } from '../../composables/useCondition'

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
    class="border border-2 border-gray-300 p-2 text-sm rounded-lg min-w-300px flex flex-col relative"
    v-if="conditionKeys.length > 0"
  >
    <div class="flex flex-col flex-gap-1 mb-2">
      <h2 class="shrink-0">Conditions</h2>
    </div>
    <div class="flex flex-col flex-gap-1">
      <div class="flex flex-row flex-items-center flex-gap-2" v-for="key in conditionKeys" :key="key">
        <button
          @click.stop="isPinned[key] = !isPinned[key]"
          class="group w-4 h-4 flex flex-wrap justify-center items-center rounded hover:bg-gray-100"
          :title="isPinned[key] ? 'Unpin' : 'Pin condition'"
        >
          <div class="i-mdi-pin text-blue-500" v-if="isPinned[key]" />
          <div class="i-mdi-pin-outline text-gray-300 group-hover:text-gray-400" v-else />
        </button>
        <span class="font-bold min-w-80px">{{ key }}:</span>
        <select
          class="bg-white border border-gray-300 rounded px-1 text-xs min-w-0 flex-1"
          v-model="conditions[key]"
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
