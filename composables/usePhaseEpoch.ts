import { usePhases } from './usePhases'
import { useEpoch, type Epoch } from './useEpoch'

interface PhaseEpochOptions {
  transition?: 'fade' | 'none'
  transitionDuration?: number
}

export type PhaseEpoch<T extends string> = Epoch & {
  phase: Readonly<Ref<T>>
  phases: readonly T[]
  goTo: (phase: T) => Promise<void>
  Phase: ReturnType<typeof usePhases>['Phase']
}

export const usePhaseEpoch = <const T extends readonly string[]>(
  name: string,
  phases: T,
  options: PhaseEpochOptions = {}
): PhaseEpoch<T[number]> => {
  type Phase = T[number]

  const E = useEpoch(name) as PhaseEpoch<Phase>
  const phasesResult = usePhases(phases, options)

  const nextPhase = async () => {
    const idx = phases.indexOf(phasesResult.phase.value)
    if (idx < phases.length - 1) {
      await phasesResult.goToPhase(phases[idx + 1])
    } else {
      E.done()
    }
  }

  E.next = nextPhase
  E.phase = phasesResult.phase
  E.phases = phases
  E.goTo = phasesResult.goToPhase
  E.Phase = phasesResult.Phase

  return E
}
