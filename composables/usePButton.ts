import { defineComponent, h, ref, type SetupContext, type SlotsType } from 'vue'
import PButton from '../components/participant/PButton.vue'
import type { ComponentPublicInstance } from 'vue'

type PButtonTypeMap = { click: string; hover: string; mousedown: string }
type PButtonParticipant = ReturnType<typeof useParticipant<PButtonTypeMap>>

type PButtonInstance = ComponentPublicInstance<{
  on: PButtonParticipant['on']
  promise: PButtonParticipant['promise']
}>

export function usePButton() {
  const P = useParticipant<PButtonTypeMap>('PButton')
  
  const Button = defineComponent({
    name: 'PButton',
    props: {
      value: { type: String, required: true },
      label: String,
      unstyled: Boolean,
      color: String as () => 'primary' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray',
      disabled: Boolean,
      delay: [Number, String],
      once: Boolean,
    },
    slots: Object as SlotsType<{ default: () => any }>,
    setup(props, { slots }: SetupContext) {
      return () => {
        // @ts-ignore
        return h(PButton, {
          ...props,
          P,
        }, slots.default)
      }
    },
  })

  return {
    P,
    Button,
  }
}
