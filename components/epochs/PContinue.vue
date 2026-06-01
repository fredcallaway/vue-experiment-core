<script lang="ts">
export const [provideContinueParams, useContinueParams, ProvideContinueParams] = defineParams({
  button: false as boolean | string,
  delay: 0,
  small: false,
})
export type ContinueParams = ReturnType<typeof useContinueParams>
</script>

<script lang="ts" setup>

const props = withDefaults(defineProps<{
  button?: boolean | string,
  delay?: NumberLike,
  small?: boolean,
}>(), {
  button: undefined, // this prevents casting undefined to false, needed for defineParams
  small: undefined,
})

const { button, delay, small } = useContinueParams({
  ...props,
  delay: R.isDefined(props.delay) ? ensureNumber(props.delay) : undefined,
})

const parentEpoch = injectParentEpoch()

const waitTime = replaceFast(delay, clamp(delay / 5, 200, delay))
const ready = useTimeout(waitTime)

const buttonText = computed(() => typeof button === 'string' ? button : 'Continue')

</script>

<template>
  <div>
    <div flex-center v-if="button">
      <PButton 
        once 
        :disabled="!ready" 
        :value="buttonText" 
        @click="parentEpoch.next"
        :class="[
          'btn-primary',
          delay > 0 && 'transition-opacity-300',
          small && 'btn-sm',
          small ? 'my-1' : 'my-2',
        ]"
      />
    </div>
    <PKey v-else-if="ready" keys="SPACE" @press="parentEpoch.next">
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
  </div>
</template>