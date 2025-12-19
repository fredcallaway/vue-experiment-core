<script lang="ts" setup>

const { done, x, y } = useMouseTracking()
const points = ref<{x: number, y: number, t: number}[]>([])
const playbackTime = ref<number | null>(null)

const finish = () => {
  const data = done()
  points.value = data.x.map((x, i) => ({x: data.x[i], y: data.y[i], t: data.t[i]}))
  
  if (points.value.length === 0) return
  
  playbackTime.value = 0
  const startTime = Date.now()
  const duration = points.value[points.value.length - 1].t
  
  const animate = () => {
    const elapsed = Date.now() - startTime
    playbackTime.value = elapsed
    
    if (elapsed < duration) {
      requestAnimationFrame(animate)
    }
  }
  
  requestAnimationFrame(animate)
}

const playbackPosition = computed(() => {
  if (playbackTime.value === null || points.value.length === 0) return null
  
  const t = playbackTime.value
  const idx = points.value.findIndex(p => p.t > t)
  
  if (idx === -1) return points.value[points.value.length - 1]
  if (idx === 0) return points.value[0]
  
  return points.value[idx - 1]
})

useInspect({x, y, playbackPosition})

</script>

<template>
  <div>
    <div v-if="points.length > 0" absolute top-0 left-0>
      {{points.length}} points
    </div>
    <button btn mt-40 @click="finish">Done</button>
    
    <div v-if="playbackPosition === null" :style="{ left: `${x-3}px`, top: `${y-3}px` }" class="w-6px h-6px bg-red-500 rounded-full absolute pointer-events-none" />
    <div v-else :style="{ left: `${playbackPosition.x-3}px`, top: `${playbackPosition.y-3}px` }" class="w-8px h-8px bg-green-500 rounded-full absolute pointer-events-none" />
  </div>
</template>