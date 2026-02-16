import { defineComponent, h, type SetupContext, type SlotsType } from 'vue'


type DisplayPhasesOption = 
| {
    duration: number
  }
| {
    inDuration?: number
    outDuration?: number
  }

const normalizeOptions = (options: DisplayPhasesOption): { inDuration: number, outDuration: number } => {
  const hasDuration = 'duration' in options
  const hasIn = 'inDuration' in options
  const hasOut = 'outDuration' in options
  if (hasDuration) {
    if (hasIn || hasOut) {
      throw new Error('duration and inDuration or outDuration cannot be used together')
    }
    return {
      inDuration: options.duration / 2,
      outDuration: options.duration / 2,
    }
  }
  return {
    inDuration: options.inDuration ?? 0,
    outDuration: options.outDuration ?? 0,
  }
}


export const useDisplayPhases = <const T extends readonly string[]>(
  phases: T,
  options: DisplayPhasesOption = {}
) => {
  type Phase = T[number]
  const { inDuration, outDuration } = normalizeOptions(options)

  const phase = ref<Phase>(phases[0])
  const fromPhase = shallowRef<Phase | null>(null)
  const toPhase = shallowRef<Phase | null>(null)
  const transitionStage = shallowRef<'out' | 'in' | null>(null)

  const { sleep } = useLocalAsync()

  // useInspect({phase, previousPhase, targetPhase, transitionStage}, 'usePhases')

  const parseWhich = (which: string): Phase[] => which.split(/\s+/) as Phase[]

  const goToPhase = async (newPhase: Phase) => {
    assertOneOf(newPhase, phases, `goToPhase: ${newPhase} is not a valid phase (${phases.join(', ')})`)
    if (phase.value === newPhase) return
    fromPhase.value = phase.value
    toPhase.value = newPhase


    // animate the transition
    await withParticipantInputBlocked(async () => {
      if (isJumping.value) {  // skip animation if we're jumping (see jumpToEpoch)
        phase.value = newPhase
      } else {
        if (outDuration > 0) {
          transitionStage.value = 'out'
          await sleep(outDuration)
        }
        phase.value = newPhase
        if (inDuration > 0) {
          transitionStage.value = 'in'
          await sleep(inDuration)
        }
      }

      transitionStage.value = null
      fromPhase.value = null
      toPhase.value = null
    })
  }

  const nextPhase = () => {
    const idx = phases.indexOf(phase.value)
    return goToPhase(phases[(idx + 1) % phases.length])
  }

  // TODO? a directive might make more sense here
  const Phase = defineComponent({
    name: 'Phase',
    props: {
      which: { type: String, required: true },
      persist: { type: Boolean, default: false },
      constant: { type: Boolean, default: false },
      static: { type: Boolean, default: false },
    },
    slots: Object as SlotsType<{ default: () => any }>,
    setup(props, { slots, attrs }: SetupContext) {
      const matchedPhases = computed(() => {
        const which = parseWhich(props.which)
        which.forEach(p => {
          assert(phases.includes(p), `which includes an invalid phase ${p} (valid: ${phases.join(', ')})`)
        })
        return which
      })
      const matchesCurrent = computed(() => matchedPhases.value.includes(phase.value))
      const matchesFrom = computed(() =>
        fromPhase.value !== null && matchedPhases.value.includes(fromPhase.value)
      )
      const matchesTo = computed(() =>
        toPhase.value !== null && matchedPhases.value.includes(toPhase.value)
      )

      const isPersisting = computed(() => {
        if (!props.persist) return false
        // is the current phase in between the earliest and latest matched phase?
        const currentIndex = phases.indexOf(phase.value)
        const matchedIndices = matchedPhases.value.map(p => phases.indexOf(p))
        const minIndex = Math.min(...matchedIndices)
        const maxIndex = Math.max(...matchedIndices)
        return currentIndex >= minIndex && currentIndex <= maxIndex
      })

      // During 'out': show previous-matching phases (fading out if not also target)
      // During 'in': show current-matching phases (fading in if not also previous)
      const isVisible = computed(() => {
        // commented out because current stage is same as from when fading out
        // if (transitionStage.value === 'out') return matchesFrom.value
        return matchesCurrent.value
      })

      const isMounted = computed(() => {
        return props.constant || isPersisting.value || matchesCurrent.value || matchesTo.value
      })

      const isFadingOut = computed(() => transitionStage.value === 'out' && matchesFrom.value && !matchesTo.value)
      const isFadingIn = computed(() => transitionStage.value === 'in' && matchesCurrent.value && !matchesFrom.value)

      return () => {
        if (!isMounted.value) return null
        
        const style: Record<string, string> = {}
        if (props.static) {
          style.position = 'static'
        }
        if (isFadingOut.value) {
          style.animation = `fade-out ${outDuration}ms ease-out forwards`
        } else if (isFadingIn.value) {
          style.animation = `fade-in ${inDuration}ms ease-in forwards`
        } else if (!isVisible.value) {
          style.opacity = '0'
          if (!props.static) {
            style.position = 'absolute'
            style.inset = '0'
          }
        }

        return h('div', { ...attrs, style }, slots.default?.())
      }
    },
  })

  return {
    phase: readonly(phase),
    transitionStage: readonly(transitionStage),
    animating: computed(() => transitionStage.value !== null),
    nextPhase,
    goToPhase,
    Phase,
  }
}
