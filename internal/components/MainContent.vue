<script lang="ts" setup>

const props = defineProps<{
  showOutline?: boolean
  fixedWidth?: boolean
  fixedHeight?: boolean
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
</script>

<template>
  <!-- wrapper div to allow outer v-show -->
  <div>
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
    </div>
    <div v-if="violated && minWidth && minHeight"
      absolute top-0 left-0 w-full h-full flex-center
    bg-black text-center text-white text-xl overflow-hidden
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
  </div>
</template>

<style scoped>

.main-content {
  @apply flex flex-col items-center overflow-hidden mx-auto;

  & div {
    flex-shrink: 0;
    overflow: hidden;
  }
}

.main-outline {
  @apply outline outline-2 outline-dashed overflow-auto outline-gray-200;
}

.overflowing {
  @apply outline-red-500;
}
</style>