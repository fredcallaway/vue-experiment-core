type PinStatus = 'none' | 'current' | 'other'

export const usePinnedEpoch = () => {
  const currentEpoch = useCurrentEpoch()
  const route = useRoute()
  const router = useRouter()

  const currentEpochIndex = computed(() => {
    const epochId = currentEpoch.value.id
    // return epochId.substring(0, epochId.lastIndexOf(']') + 1)
    return epochId
  })

  const pinnedIndex = computed(() => {
    const jump = route.query.jump
    return typeof jump === 'string' ? jump : undefined
  })

  const pinStatus = computed<PinStatus>(() => {
    if (pinnedIndex.value === currentEpochIndex.value) return 'current'
    if (pinnedIndex.value !== undefined) return 'other'
    return 'none'
  })

  const setPinnedEpoch = async (jump: string | undefined) => {
    await router.push({
      query: { ...route.query, jump }
    })
  }

  const cycleCurrentPin = async () => {
    const newPin = pinStatus.value === 'current' ? undefined : currentEpochIndex.value
    await setPinnedEpoch(newPin)
  }

  const pinAndJumpToEpoch = async (epochId: string) => {
    await setPinnedEpoch(epochId)
    await jumpToEpoch(epochId)
  }

  return {
    currentEpochIndex,
    pinnedIndex,
    pinStatus,
    setPinnedEpoch,
    cycleCurrentPin,
    pinAndJumpToEpoch,
  }
}
