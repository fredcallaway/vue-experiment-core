import { defineComponent, h, type SetupContext, type SlotsType } from 'vue'
import { useEpoch, useCurrentEpoch, type Epoch } from './useEpoch'
import { logEvent } from './logEvent'

interface PhaseEpochOptions {
  transition?: 'fade' | 'none'
  transitionDuration?: number
}

export type PhaseEpoch<T extends string> = Epoch & {
  phase: Readonly<Ref<T>>
  phases: readonly T[]
  nextPhase: () => Promise<void>
  goToPhase: (phase: T) => Promise<void>
  Phase: ReturnType<typeof defineComponent>
}

export const usePhaseEpoch = <const T extends readonly string[]>(
  name: string,
  phases: T,
  options: PhaseEpochOptions = {}
): PhaseEpoch<T[number]> => {
  type Phase = T[number]
  const { transition = 'fade', transitionDuration = 150 } = options

  const E = useEpoch(name) as PhaseEpoch<Phase>
  const currentEpoch = useCurrentEpoch()

  const phase = ref<Phase>(phases[0])
  const previousPhase = shallowRef<Phase | null>(null)
  const targetPhase = shallowRef<Phase | null>(null)
  const transitionStage = shallowRef<'out' | 'in' | null>(null)
  const currentPhaseEpoch = shallowRef<Epoch | null>(null)

  const parseWhich = (which: string): Phase[] => which.split(/\s+/) as Phase[]

  const startPhaseEpoch = (phaseName: Phase) => {
    const id = `${E.id}-${phaseName}`
    const epoch: Epoch = {
      _name: phaseName,
      id,
      _parent: E,
      done: () => {
        currentEpoch.value = E
      },
      next: () => {
        currentEpoch.value = E
      },
    }
    currentPhaseEpoch.value = epoch
    currentEpoch.value = epoch
    logEvent(`epoch.start.${phaseName}`, { id })
  }

  const endPhaseEpoch = () => {
    if (currentPhaseEpoch.value) {
      currentPhaseEpoch.value.done()
      currentPhaseEpoch.value = null
    }
  }

  // Start the first phase epoch
  startPhaseEpoch(phases[0])

  const goToPhase = async (newPhase: Phase) => {
    if (phase.value === newPhase) return
        
    if (transition === 'none') {
      phase.value = newPhase
      endPhaseEpoch()
      startPhaseEpoch(newPhase)
      return
    }
    previousPhase.value = phase.value
    targetPhase.value = newPhase
    transitionStage.value = 'out'
    await new Promise(r => setTimeout(r, transitionDuration))
    phase.value = newPhase
    transitionStage.value = 'in'
    endPhaseEpoch()
    startPhaseEpoch(newPhase)

    await new Promise(r => setTimeout(r, transitionDuration))
    transitionStage.value = null
    previousPhase.value = null
    targetPhase.value = null
    
  }

  const nextPhase = async () => {
    const idx = phases.indexOf(phase.value)
    if (idx < phases.length - 1) {
      await goToPhase(phases[idx + 1])
    } else {
      endPhaseEpoch()
      E.done()
    }
  }

  E.next = nextPhase

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
          style.animation = `fade-out ${transitionDuration / 2}ms ease-out forwards`
        } else if (isFadingIn.value) {
          style.animation = `fade-in ${transitionDuration / 2}ms ease-in forwards`
        }

        return h('div', { ...attrs, style }, slots.default?.())
      }
    },
  })

  E.phase = readonly(phase)
  E.phases = phases
  E.nextPhase = nextPhase
  E.goToPhase = goToPhase
  E.Phase = Phase

  return E
}
