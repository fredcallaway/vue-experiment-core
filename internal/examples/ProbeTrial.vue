<script lang="ts">

// Minimal params-driven component for the configuration example. The module-level
// defineParams is shared by every instance; each instance resolves its own
// params from defaults + provided overrides + its `params` prop.

export const [provideProbeParams, useProbeParams] = defineParams({
  color: 'steelblue',
  size: 80,
})
export type ProbeParams = ReturnType<typeof useProbeParams>

</script>

<script lang="ts" setup>

const props = defineProps<{ params?: Partial<ProbeParams> }>()
const params = useProbeParams(props.params)

</script>

<template>
  <div flex-col flex-center gap-2>
    <div rounded :style="{ width: `${params.size}px`, height: `${params.size}px`, background: params.color }" />
    <code text-xs>{{ params.color }} / {{ params.size }}</code>
  </div>
</template>
