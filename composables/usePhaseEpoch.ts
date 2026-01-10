import { usePhases } from './usePhases'
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
  Phase: ReturnType<typeof usePhases>['Phase']
}

export const usePhaseEpoch = <const T extends readonly string[]>(
  name: string,
  phases: T,
  options: PhaseEpochOptions = {}
): PhaseEpoch<T[number]> => {
  type Phase = T[number]

  const E = useEpoch(name) as PhaseEpoch<Phase>
  const currentEpoch = useCurrentEpoch()
  const currentPhaseEpoch = shallowRef<Epoch | null>(null)

  const startPhaseEpoch = (phaseName: Phase) => {
    const id = `${E.id}-${phaseName}`
    const epoch: Epoch = {
      _name: phaseName,
      id,
      _parent: E,
      done: () => { currentEpoch.value = E },
      next: () => { currentEpoch.value = E },
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

  const phasesResult = usePhases(phases, options)

  // Start the first phase epoch
  startPhaseEpoch(phases[0])

  // Wrap goToPhase to manage phase epochs
  const originalGoToPhase = phasesResult.goToPhase
  const goToPhase = async (newPhase: Phase) => {
    if (phasesResult.phase.value === newPhase) return
    await originalGoToPhase(newPhase)
    endPhaseEpoch()
    startPhaseEpoch(newPhase)
  }

  const nextPhase = async () => {
    const idx = phases.indexOf(phasesResult.phase.value)
    if (idx < phases.length - 1) {
      await goToPhase(phases[idx + 1])
    } else {
      endPhaseEpoch()
      E.done()
    }
  }

  E.next = nextPhase
  E.phase = phasesResult.phase
  E.phases = phases
  E.nextPhase = nextPhase
  E.goToPhase = goToPhase
  E.Phase = phasesResult.Phase

  return E
}
