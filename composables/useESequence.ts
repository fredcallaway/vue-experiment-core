import { defineComponent, h, type SetupContext, type SlotsType } from 'vue'
import { useIndexableEpoch, type IndexableEpoch } from './useEpoch'
import ESequence from '../components/epochs/ESequence.vue'

export function useESequence(name: string) {
  const E = useIndexableEpoch(name, 0)
  
  const Sequence = defineComponent({
    name: 'Sequence',
    slots: Object as SlotsType<{ default: () => any }>,
    setup(_props, { slots }: SetupContext) {
      return () => {
        return h(ESequence, { epoch: E }, slots.default)
      }
    },
  })

  return {E, Sequence}
}