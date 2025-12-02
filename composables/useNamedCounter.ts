export const useNamedCounter = useMemoize((name: string) => { 

  return reactive({
    value: 0,
    get() { 
      return this.value 
    },
    inc() { 
      this.value++ 
      return this.value
    },
    dec() { 
      this.value-- 
      return this.value
    },
    reset() { 
      this.value = 0 
      return this.value
    },
  })
})
