<script lang="ts">
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
      <slot />
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
  </div>
</template>