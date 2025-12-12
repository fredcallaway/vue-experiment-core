type PlaybackState = 'none' | 'playing' | 'paused'


export const usePlaybackState = createGlobalState(() => {

  const state = ref<PlaybackState>('none')
  const currentEventIndex = ref(-1)
  const currentTime = ref(0.)
  const events = ref<LogEvent[]>([])

  return { state, currentEventIndex, currentTime, events, }
})

