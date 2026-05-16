import PButton from '../components/participant/PButton.vue'
import type { SetupContext } from 'vue'
import { createEventController } from '../utils/eventController'

type PButtonTypeMap = { click: string; hover: string; mousedown: string }

type PButtonProps = InstanceType<typeof PButton>['$props']

export function usePButton(props: PButtonProps) {
  const controller = createEventController<PButtonTypeMap>()
  
  const Button = defineComponent({
    setup(localProps, { slots }: SetupContext) {
      return () => {
        return h(PButton, {
          ...props,
          ...localProps,
          controller,
        }, slots.default)
      }
    },
  })

  return Object.assign(Button, {
    on: controller.on,
    promise: controller.promise,
  })
}
