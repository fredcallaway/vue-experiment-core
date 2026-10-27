<script setup lang="ts">
import type { VersionWarning } from '../deploymentSafety'

defineProps<{ warnings: VersionWarning[] }>()
const acknowledged = defineModel<boolean>({ default: false })
</script>

<template>
  <div v-if="warnings.length" class="p-4 rounded-lg bg-warn-200 text-warn-700" role="alert">
    <b>⚠ This experiment version has already been posted with different code</b>
    <p v-for="warning in warnings" :key="warning.studyId">{{ warning.message }}</p>
    <label class="flex items-center gap-2">
      <input v-model="acknowledged" type="checkbox" />
      I reviewed the changes and intentionally keep this experiment version.
    </label>
  </div>
</template>
