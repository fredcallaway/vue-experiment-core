type PlaybackState = 'stopped' | 'playing' | 'paused'


export const usePlaybackState = createGlobalState(() => {

  const state = ref<PlaybackState>('stopped')
  const currentEventIndex = ref(-1)
  const currentTime = ref(0.)
  const events = ref<LogEvent[]>([])

  return { state, currentEventIndex, currentTime, events, }
})

