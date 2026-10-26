<script lang="ts" setup>
import { useEventListener } from '@vueuse/core'
import { useTutorialMode } from '../composables/useTutorialMode'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  as?: string
  title?: string
  help?: string
  placement?: 'bottom' | 'left'
}>(), {
  as: 'div',
  placement: 'bottom',
})

const id = useId()
const targetEl = useTemplateRef<HTMLElement>('target')
const tooltipEl = useTemplateRef<HTMLElement>('tooltip')
const { tutorialMode } = useTutorialMode()
const targets = useState<Record<string, string[]>>('tutorial-targets', () => ({}))
const enabled = computed(() => tutorialMode.value && !!props.help)
const key = computed(() => props.help?.replace(/\s+/g, ' ').trim() ?? '')

// Repeated controls share one highlight; the next instance takes over when the first unmounts.
watch([enabled, key], ([enabled, key], _, onCleanup) => {
  if (!enabled) return
  targets.value[key] = [...(targets.value[key] ?? []), id]
  onCleanup(() => {
    const remaining = targets.value[key]?.filter(target => target !== id) ?? []
    if (remaining.length) targets.value[key] = remaining
    else delete targets.value[key]
  })
}, { immediate: true })

const active = computed(() => enabled.value && targets.value[key.value]?.[0] === id)
const openTooltip = useState<string | null>('tutorial-tooltip', () => null)
const showTooltip = computed(() => active.value && openTooltip.value === id)
const position = ref({ left: '0px', top: '0px' })

const show = (event: Event) => {
  if (!active.value) return
  event.stopPropagation()
  openTooltip.value = id
}
const close = () => {
  if (openTooltip.value === id) openTooltip.value = null
}

watch(showTooltip, async (show, _, onCleanup) => {
  if (!show) return
  const stopScroll = useEventListener(window, 'scroll', close, { capture: true })
  const stopResize = useEventListener(window, 'resize', close)
  const stopKey = useEventListener(window, 'keydown', (event) => {
    if (event.key === 'Escape') close()
  })
  onCleanup(() => { stopScroll(); stopResize(); stopKey() })

  await nextTick()
  if (!targetEl.value || !tooltipEl.value) return
  const target = targetEl.value.getBoundingClientRect()
  const { width, height } = tooltipEl.value.getBoundingClientRect()
  const left = props.placement === 'left' ? target.right - width : target.left
  const top = target.bottom + height + 8 > window.innerHeight ? target.top - height - 8 : target.bottom + 8
  position.value = {
    left: `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`,
    top: `${Math.max(8, top)}px`,
  }
})
</script>

<template>
  <component
    :is="as"
    ref="target"
    v-bind="$attrs"
    :title="active ? undefined : title"
    :class="{ 'tutorial-target-active': active }"
    :tabindex="active && as === 'div' ? 0 : undefined"
    :aria-describedby="showTooltip ? id : undefined"
    @mouseenter="show"
    @mouseleave="close"
    @focusin="show"
    @focusout="close"
  >
    <slot />
  </component>
  <Teleport to="body">
    <div v-if="showTooltip" :id="id" ref="tooltip" role="tooltip" class="tutorial-help" :style="position">
      <div class="font-bold mb-1">{{ title }}</div>
      {{ help }}
    </div>
  </Teleport>
</template>

<style scoped>
.tutorial-target-active {
  outline: 3px solid #f472b6;
  outline-offset: 3px;
}

.tutorial-help {
  position: fixed;
  z-index: 100;
  width: 18rem;
  max-width: calc(100vw - 1rem);
  padding: 0.75rem;
  border: 1px solid #f9a8d4;
  border-radius: 0.5rem;
  background: #fff7fb;
  box-shadow: 0 12px 28px rgb(0 0 0 / 14%);
  color: #374151;
  font-size: 0.875rem;
  line-height: 1.35;
  pointer-events: none;
}
</style>
