type ErrorHandler = (
  err: unknown,
  instance: any,
  info: string,
  next: () => void
) => void

type HandlerEntry = {
  handler: ErrorHandler
  priority: number
  sequence: number
}


export const useErrorHandler = createGlobalState(() => {
  const nuxtApp = useNuxtApp()
  const originalHandler = nuxtApp.vueApp.config.errorHandler
  
  const handlers = ref<HandlerEntry[]>([])
  let sequenceCounter = 0

  const getSortedHandlers = () => {
    return R.pipe(
      handlers.value,
      R.sortBy((entry) => -entry.priority, (entry) => -entry.sequence),
    ).map(e => e.handler)
  }

  const vueErrorHandler = (err: unknown, instance: any, info: string) => {
    const sortedHandlers = getSortedHandlers()
    let currentIndex = 0
    
    const next = () => {
      currentIndex++
      if (currentIndex < sortedHandlers.length) {
        sortedHandlers[currentIndex](err, instance, info, next)
      } else {
        console.error('Unhandled error:', err)
        if (originalHandler) {
          originalHandler(err, instance, info)
        } else {
          console.error('Unhandled error:', err)
        }
      }
    }

    if (sortedHandlers.length > 0) {
      sortedHandlers[0](err, instance, info, next)
    } else {
      next()
    }
  }

  nuxtApp.vueApp.config.errorHandler = vueErrorHandler

  const pushHandler = (handler: ErrorHandler, priority = 0) => {
    handlers.value.push({ handler, priority, sequence: sequenceCounter++ })
    return () => popHandler(handler)
  }

  const popHandler = (handler: ErrorHandler) => {
    const index = handlers.value.findIndex(e => e.handler === handler)
    if (index !== -1) {
      handlers.value.splice(index, 1)
    }
  }

  return {
    pushHandler,
    popHandler,
  }
})
