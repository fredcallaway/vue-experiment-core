import PButton from '../components/participant/PButton.vue'
import type { SetupContext } from 'vue'
type PButtonTypeMap = { click: string; hover: string; mousedown: string }

type PButtonProps = InstanceType<typeof PButton>['$props']

export function usePButton(props: PButtonProps) {
  const P = useParticipant<PButtonTypeMap>()
  
  const Button = defineComponent({
    // name: `usePButton(${name})`,
    setup(localProps, { slots }: SetupContext) {
      return () => {
        return h(PButton, {
          // value: name,
          ...props,
          ...localProps,
          P,
        }, slots.default)
      }
    },
  })
 
  return {
    ...Button,
    on: P.on,
    promise: P.promise,
  }
}
