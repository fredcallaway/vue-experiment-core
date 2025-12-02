<script lang="ts">
import { defineComponent, type VNode, Comment, Fragment, cloneVNode, computed } from 'vue'

// Store HMR state
// NOTE: we can remove this when we switch to using normal reactive state (not in useEpoch)
// Persist across HMR using Vite's hot data bag
const __hot = import.meta.hot
const hmrState: Map<string, number> = (__hot?.data?.ESequenceHmrState as any) ?? new Map()
if (__hot) {
  __hot.data.ESequenceHmrState = hmrState
}

// there's an edge case where the template contains "<!--v-if-->" --- we don't handle that
const isIfFalseNode = (node: VNode) => node.type === Comment && node.children == "v-if"
const isCommentNode = (node: VNode) => node.type === Comment && node.children != "v-if"
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
    const E = useIndexableEpoch(props.name, nSteps)

    // Get state from HMR store or use initial values
    E.step.value = hmrState.get(E.id) ?? props.step
    // Update HMR state whenever it changes
    watchEffect(() => {
      hmrState.set(E.id, E.step.value)
    })
    // clear when the epoch ends
    onUnmounted(() => {
      hmrState.delete(E.id)
    })

    // Expose epoch to parent components
    context.expose({
      epoch: E
    })

    return () => {
      // Get fresh children on each render to make it reactive
      const rawChildren = extractChildren(context.slots.default?.(E) || [])
      const children = rawChildren
      .map((child: VNode, index: number) => {
        return cloneVNode(child, {
          key: `${props.name}-${index}`
        })
      })


      childrenRef.value = children
      
      const currentChild = children[E.step.value]

      if (isIfFalseNode(currentChild)) {
        // console.log('👉 skipping child', currentChild)
        // child has v-if=false -> skip it
        E.next()
        return null
      }
      
      return currentChild ?? null
    }
  }
})

</script>
