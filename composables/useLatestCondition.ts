// Captures the most recent `experiment.condition` payload for the dev Parameters panel. The
// subscription is set up as a global state initialized from app.vue (which sets up before any
// experiment page), so it catches the condition event even though pages log it during their own
// setup (before ParametersView, a later sibling in the dev layout, would mount).
export const useLatestCondition = createGlobalState(() => {
  const condition = ref<Record<string, unknown> | null>(null)
  useLogEventBus().on((e) => {
    if (e.eventType === 'experiment.condition') condition.value = (e.data ?? {}) as Record<string, unknown>
  })
  return condition
})
