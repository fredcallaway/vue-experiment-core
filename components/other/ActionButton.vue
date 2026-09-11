<script setup lang="ts">
type Handler = string | ((data: any) => string) | ((data: any) => {message: string, description: string}) | boolean

interface Props {
  name: string
  action: () => Promise<unknown> | void
  disabled?: boolean
  loading?: Handler
  error?: Handler
  success?: Handler | "result"
}

const props = withDefaults(defineProps<Props>(), {
  loading: undefined,
  success: undefined,
  error: undefined,
})
const attrs = useAttrs()

const defineHandlers = () => {
  let { loading, success, error } = props

  // treat empty strings as flags (as in vue default parsing)
  if (success === "") success = true
  if (loading === "") loading = true
  if (error === "") error = true

  // show error by default
  if (error === undefined) error = true
  // show success by default if loading provided
  if (success !== false && !success && loading) success = true
  
  // replace true with default values
  if (loading === true) loading = `${props.name}: Loading`
  
  if (success === true) {
    success = `${props.name}: Success`
  } else if (success === "result") {
    success = (result: any) => {
      return {message: `${props.name}: Success`, description: String(result)}
    }
  }
  if (error === true || (error !== false && !error)) {
    error = (err: any) => {
      console.error(err)
      return {message: `${props.name}: Failure`, description: String(err), duration: Infinity}
    }
  }

  if (success === false) success = undefined
  if (loading === false) loading = undefined
  if (error === false) error = undefined

  logDebug('defineHandlers', {loading, success, error})

  return {
    loading,
    success,
    error,
  }
}

const isLoading = ref(false)
const shouldShake = ref(false)
const shouldPop = ref(false)

const handleClick = async () => {
  if (props.disabled || isLoading.value) return
  
  isLoading.value = true
  shouldShake.value = false

  const promise = (async () => await props.action())()
  toast.promise(promise, defineHandlers())
  promise
  .then(() => {
    shouldPop.value = true
    setTimeout(() => {
      shouldPop.value = false
    }, 1000)
  })
  .catch(() => {
    shouldShake.value = true
    setTimeout(() => {
      shouldShake.value = false
    }, 500)
  })
  .finally(() => {
    isLoading.value = false
  })
}
</script>

<template>
  <button btn
    v-bind="attrs"
    :class="[
      attrs.class,
      shouldShake && 'animate-head-shake',
      shouldPop && 'pop',
      isLoading && 'opacity-50 cursor-not-allowed'
    ]"
    :disabled="disabled || isLoading"
    @click="handleClick"
  >
  <slot v-if="$slots.default" />
  <template v-else>{{ name }}</template>
  </button>
</template>

<style scoped>
@keyframes pop {
  0% { transform: scale(1); }
  20% { opacity: 1; }
  50% { transform: scale(1.03)}
  80% { opacity: 1; }
  100% { transform: scale(1); }
}

.pop {
  animation: pop 0.4s ease-out 1;
}
</style>
