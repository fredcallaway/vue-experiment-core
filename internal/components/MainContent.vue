<script lang="ts" setup>

const props = defineProps<{
  showOutline?: boolean
  fixedWidth?: boolean
  fixedHeight?: boolean
  captureErrors?: boolean
}>()

const padding = 20 // this seems to ensure no scrollbars

const { minWidth, minHeight, width, height, violated } = useWindowEnforcer()

// make outline red if content overflows
const content = ref<HTMLElement>()
const hasOverflow = ref(false)

useResizeObserver(content, () => {
  if (!content.value) return
  const el = content.value
  hasOverflow.value = el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth
})
whenever(content, (el) => {
  if (!el) return
  mainContentRef.value = el
})

// error handling
const error = ref<any>(null)
const errorDetails = ref<any>(null)

const { pushHandler } = useErrorHandler()
const popHandler = pushHandler((err, instance, info, next) => {
  if (props.captureErrors) {
    errorDetails.value = {

    }
    errorDetails.value = {
      componentName: instance?.$options?.__name,
      componentPath: instance?.$options?.__file,
      info,
    }
    logError(err as Error, toRaw(errorDetails.value))
    useCurrentSession().error = String(err)
    error.value = err
    return
  }
  next()
})

onUnmounted(popHandler)

watch(() => isJumping.value, (value) => {
  if (error.value) {
    error.value = null
  }
})

const devTools = inject<Ref<boolean>>('devTools')
const currentEpoch = useCurrentEpoch()

</script>

<template>
  <!-- wrapper div to allow outer v-show -->
  <div relative class="main-content"
    :class="{
      'main-outline': props.showOutline,
      'overflowing': hasOverflow,
    }"
    :style="{
      minWidth: `${minWidth - padding}px`,
      minHeight: `${minHeight - padding}px`,
      width: props.fixedWidth ? `${minWidth - padding}px` : 'auto',
      height: props.fixedHeight ? `${minHeight - padding}px` : 'auto',
  }">
    <!-- error page -->
    <div v-if="error" wfull hfull >
      <div w-full h-fit p-3 gap-2 v-if="devTools">
        <h1>Error</h1>
        <div>
          The experiment encountered an error in dev mode. This would have
          led to a completion screen in live mode.
        </div>
        <div my-3>
          <div><b>Error:</b> {{ error.message }}</div>
          <div><b>Current Epoch:</b> {{ currentEpoch.id }}</div>
          <div><b>Component:</b> {{ errorDetails.componentName }}</div>
          <div><b>Component Path:</b> {{ errorDetails.componentPath }}</div>
          <div><b>Vue Info:</b> {{ errorDetails.info }}</div>
        </div>
        <div text-lg font-bold>Stack trace</div>
        <div font-italic mb-1>See the browser console for a better stack trace.</div>
        <pre text-xs overflow-auto mx-5 subtle-scrollbar >{{ error.stack ?? String(error) }}</pre>
        <!-- <Error :error="error" /> -->
        
        <div flex-center gap-3 mt-3>
          <button btn-red  @click="error = false">Clear Error</button>
          <button btn-blue  @click="error = false; currentEpoch.done()">Next Epoch</button>
        </div>
      </div>
      <template v-else>
        <ECompletion error h-500px  />
      </template>
    </div>
    <!-- main content -->
    <div v-show="!violated && !error" ref="content" >
      <slot />
      <div id="main-content-overlay" absolute inset-0 wfull hfull pointer-events-none />
    </div>
    <!-- screen size violated -->
    <div v-if="violated"
      inset-0 top-0 left-0 w-screen h-screen flex-center
    bg-black text-center text-white text-xl
    >
      <div p-5>
        You're browser window isn't large enough.<br>
        It needs to be
          <span :class="width < minWidth ? 'text-red-500' : ''">{{ minWidth }}px wide</span> and
          <span :class="height < minHeight ? 'text-red-500' : ''">{{ minHeight }}px tall</span>.<br>
        It's currently
          <span :class="width < minWidth ? 'text-red-500' : ''">{{ width }}px wide</span> and
          <span :class="height < minHeight ? 'text-red-500' : ''">{{ height }}px tall</span>.
          <p mt-3 text-base w-80 mx-auto>
            If you can't make it bigger, you can't participate in this experiment. Sorry!
          </p>
          <p mt-30 font-italic text-base w-100 mx-auto opacity-30 text-xs>
            Tip: you can try zooming out in your browser
            (usually cmd/ctrl and +/-). Make sure you can still read the text though!
          </p>
      </div>
    </div>
  </div>
</template>

<style scoped>

.main-content {
  @apply relative flex flex-col items-center overflow-hidden mx-auto;

  & div {
    flex-shrink: 0;
    overflow: hidden;
  }
}

.main-outline {
  @apply outline-2 outline-dashed overflow-auto outline-gray-200;
}

.overflowing {
  @apply outline-red-500;
}
</style>