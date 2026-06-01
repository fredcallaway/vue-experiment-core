<script lang="ts">
import { defineComponent, type VNode, Comment, Fragment, cloneVNode, computed } from 'vue'

// Store HMR state (dev only)
// NOTE: we can remove this when we switch to using normal reactive state (not in useEpoch)
// Persist across HMR using Vite's hot data bag
const __hot = import.meta.dev ? import.meta.hot : null
const hmrState: Map<string, number> | null = import.meta.dev 
  ? ((__hot?.data?.ESequenceHmrState as any) ?? new Map())
  : null
if (__hot) {
  __hot.data.ESequenceHmrState = hmrState
}

console.log('hmrState', hmrState)

const isCommentNode = (node: VNode) => node.type === Comment
const isFragmentNode = (node: VNode) => node.type === Fragment

const extractChildren = (children: VNode[]): VNode[] => {
  return R.pipe(
    children,
    R.filter(x => !isCommentNode(x)),
    R.flatMap((child) => {
      if (isFragmentNode(child)) {
        return extractChildren(child.children as VNode[])
      }
      return child
    })
  )
}

export default defineComponent({
  props: {
    name: {
      type: String,
      default: 'ESequence',
    },
    step: {
      type: [Number],
      default: 0,
    },
    epoch: {
      type: Object as PropType<IndexableEpoch>,
      required: false
    }
  },
  setup(props, context) {
    
    // Create a reactive children reference that will be updated in the render function
    const childrenRef = ref<VNode[]>([])

    // each child element is a step (excluding comments)
    const nSteps = extractChildren(context.slots.default!()).length
    if (nSteps == 0) {
      throw new Error(`ESequence ${props.name} has no children`)
    }
    
    // use prop epoch if provided; otherwise make a new one
    const E = props.epoch ?? useIndexableEpoch(props.name, nSteps)
    if (props.epoch) {
      E.nSteps = nSteps
      if (props.name && props.name !== 'ESequence') {
        assert(props.name == E._name, `ESequence: props.name (${props.name}) != props.epoch.name (${E._name})`)
      }
    }

    // Get state from HMR store or use initial values (dev only)
    E.step.value = import.meta.dev && hmrState ? (hmrState.get(E.id) ?? props.step) : props.step
    // Update HMR state whenever it changes (dev only)
    if (import.meta.dev && hmrState) {
      watchEffect(() => {
        hmrState.set(E.id, E.step.value)
      })
      // clear on unmount or epoch end (usually synonymous)
      onUnmounted(() => {
        hmrState.delete(E.id)
      })
      // clear when the epoch ends
      E.onDone(() => {
        hmrState.delete(E.id)
      })
    }

    // Expose epoch to parent components
    context.expose({
      epoch: E
    })

    return () => {
      // Get fresh children on each render to make it reactive
      const rawChildren = extractChildren(context.slots.default?.(E) || [])
      const children = rawChildren.map((child: VNode, index: number) => {
        return cloneVNode(child, {
          key: `${props.name}-${index}`
        })
      })
      childrenRef.value = children
      
      const currentChild = children[E.step.value]

      assert(!isCommentNode(currentChild), 'ESequence: currentChild is a comment node')
      
      return currentChild ?? null
    }
  }
})

</script>
