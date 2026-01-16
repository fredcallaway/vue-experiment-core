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
const error = ref(false)

const nuxtApp = useNuxtApp()
const defaultHandler = nuxtApp.vueApp.config.errorHandler
nuxtApp.vueApp.config.errorHandler = (err, instance, info) => {

  // this error is expected behavior; see useLocalAsync.ts
  if (err === 'useLocalAsync:unmounted') {
    // console.debug('caught useLocalAsync:unmounted')
    return
  }

  if (props.captureErrors) {
    const componentName = instance?.$options?.__name
    const componentPath = instance?.$options?.__file
    logError(err as Error, {info, componentName, componentPath})
    useCurrentSession().error = String(err)
    error.value = true
    return
  }
  
  if (defaultHandler) {
    console.log('calling default handler')
    // TODO don't use default handler so that the developer interface is maintained
    // could add devtools navigation here
    // const devtoolsClient = useNuxtDevTools()
    // devtoolsClient.value?.devtools.navigate('/modules/error')
    defaultHandler(err, instance, info)
  } else {
    // I don't think this case is possible, but just in case
    console.error('No default error handler found')
    throw new Error('No default error handler found')
  }
}

</script>

<template>
  <!-- wrapper div to allow outer v-show -->
  <div relative>
    <template v-if="error">
      <div wfull hfull flex-center >
        <ECompletion error h-500px  />
      </div>
    </template>
    <template v-else>
      <div v-show="!violated" ref="content" class="main-content"
        :class="{
          'main-outline': props.showOutline,
          'overflowing': hasOverflow,
        }"
        :style="{
          minWidth: `${minWidth - padding}px`,
          minHeight: `${minHeight - padding}px`,
          width: props.fixedWidth ? `${minWidth - padding}px` : 'auto',
          height: props.fixedHeight ? `${minHeight - padding}px` : 'auto',
        }"
      >
        <slot />
        <div id="main-content-overlay" absolute inset-0 wfull hfull pointer-events-none />
      </div>
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
        </div>
      </div>
    </template>
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