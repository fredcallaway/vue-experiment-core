import { defineComponent, h, type SetupContext, type SlotsType } from 'vue'

interface PhasesOptions {
  transition?: 'fade' | 'none'
  transitionDuration?: number
}

export const usePhases = <const T extends readonly string[]>(
  phases: T,
  options: PhasesOptions = {}
) => {
  type Phase = T[number]
  const { transition = 'fade', transitionDuration = 150 } = options

  const phase = ref<Phase>(phases[0])
  const previousPhase = shallowRef<Phase | null>(null)
  const targetPhase = shallowRef<Phase | null>(null)
  const transitionStage = shallowRef<'out' | 'in' | null>(null)

  useInspect({phase, previousPhase, targetPhase, transitionStage}, 'usePhases')

  const parseWhich = (which: string): Phase[] => which.split(/\s+/) as Phase[]

  const goToPhase = async (newPhase: Phase, duration: number = transitionDuration) => {
    if (phase.value === newPhase) return
    if (transition === 'none' || duration === 0) {
      phase.value = newPhase
      return
    }
    previousPhase.value = phase.value
    targetPhase.value = newPhase
    transitionStage.value = 'out'
    await new Promise(r => setTimeout(r, duration))
    phase.value = newPhase
    transitionStage.value = 'in'
    await new Promise(r => setTimeout(r, duration))
    transitionStage.value = null
    previousPhase.value = null
    targetPhase.value = null
  }

  const nextPhase = () => {
    const idx = phases.indexOf(phase.value)
    return goToPhase(phases[(idx + 1) % phases.length])
  }

  const Phase = defineComponent({
    name: 'Phase',
    props: {
      which: { type: String, required: true },
    },
    slots: Object as SlotsType<{ default: () => any }>,
    setup(props, { slots, attrs }: SetupContext) {
      const matchedPhases = computed(() => parseWhich(props.which))
      const matchesCurrent = computed(() => matchedPhases.value.includes(phase.value))
      const matchedPrevious = computed(() =>
        previousPhase.value !== null && matchedPhases.value.includes(previousPhase.value)
      )
      const matchesTarget = computed(() =>
        targetPhase.value !== null && matchedPhases.value.includes(targetPhase.value)
      )

      // During 'out': show previous-matching phases (fading out if not also target)
      // During 'in': show current-matching phases (fading in if not also previous)
      const isVisible = computed(() => {
        if (transitionStage.value === 'out') return matchedPrevious.value
        return matchesCurrent.value
      })
      const isFadingOut = computed(() => transitionStage.value === 'out' && matchedPrevious.value && !matchesTarget.value)
      const isFadingIn = computed(() => transitionStage.value === 'in' && matchesCurrent.value && !matchedPrevious.value)

      return () => {
        if (!isVisible.value) return null

        const style: Record<string, string> = {}
        if (isFadingOut.value) {
          style.animation = `fade-out ${transitionDuration/2}ms ease-out forwards`
        } else if (isFadingIn.value) {
          style.animation = `fade-in ${transitionDuration/2}ms ease-in forwards`
        }

        return h('div', { ...attrs, style }, slots.default?.())
      }
    },
  })

  return {
    phase: readonly(phase),
    nextPhase,
    goToPhase,
    Phase,
  }
}
