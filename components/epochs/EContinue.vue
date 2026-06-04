<script lang="ts">
// EContinue is the standard leaf epoch: it shows some content and advances when the
// participant continues (a button, or the space key). It bundles the three things a
// simple screen almost always needs — an epoch wrapper, a content slot, and a
// continue affordance — so most instruction/text screens are a single EContinue.
//
// Reach for a custom component instead when a screen has real internal logic (phases,
// timing, shared state); see the custom-epoch demo. EContinue (and the lower-level
// EPage it builds on) is for "show this, then move on".

export const [provideContinueParams, useContinueParams, ProvideContinueParams] = defineParams({
  name: 'EContinue',
  button: false as boolean | string,
  delay: 0,
  prompt: false,
  small: false,
})
export type ContinueParams = ReturnType<typeof useContinueParams>
</script>

<script lang="ts" setup>

const props = withDefaults(defineProps<{
  name?: string,
  button?: boolean | string,
  delay?: NumberLike,
  prompt?: boolean,
  small?: boolean,
}>(), {
  button: undefined, // this prevents casting undefined to false, needed for defineParams
  prompt: undefined,
  small: undefined,
})

const { name, button, delay, prompt, small } = useContinueParams({
  ...props,
  delay: R.isDefined(props.delay) ? ensureNumber(props.delay) : undefined,
})

// EContinue is its own epoch; continuing advances to the next sibling.
const epoch = useEpoch(name ?? 'EContinue')

const emit = defineEmits<{ (e: 'mounted', epoch: Epoch): void }>()
onMounted(() => emit('mounted', epoch))

const waitTime = replaceFast(delay, clamp(delay / 5, 200, delay))
const ready = useTimeout(waitTime)

const buttonText = computed(() => typeof button === 'string' ? button : 'Continue')

</script>

<template>
  <div flex-center flex-col>
    <div :class="{ 'prompt': prompt }">
      <slot :epoch="epoch" />
    </div>

    <PButton v-if="button" once :disabled="!ready" :value="buttonText" @click="epoch.done"
      btn-primary
      :class="[
        delay > 0 && 'transition-opacity-300',
        small && 'btn-sm',
        small ? 'my-1' : 'my-2',
      ]"
    />
    <PKey v-else-if="ready" keys="SPACE" @press="epoch.done">
      <div text-primary-300 font-italic text-center
        :class="[
          delay > 0 && 'animate-fade-in ease-in-out',
          small ? 'text-sm' : 'text-base',
          small ? 'my-1' : 'my-2',
        ]"
        :style="{ animationDuration: `${clamp(waitTime / 2, 200, 1000 )}ms` }"
      >
        press space to continue.
      </div>
    </PKey>

    <!-- Content rendered below the button / space prompt (e.g. a secondary note). -->
    <slot name="bottom" :epoch="epoch" />
  </div>
</template>
