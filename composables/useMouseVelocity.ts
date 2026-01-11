import { ref, computed, onMounted, onUnmounted } from 'vue'

type Sample = {
  t: number
  x: number
  y: number
}

// reactive mouse velocity in pixels per second
export function useMouseVelocity(windowMs = 60, idleMs = max(60, windowMs)) {
  const samples = ref<Sample[]>([])
  const now = ref(performance.now())

  let rafId: number | null = null

  function tick() {
    now.value = performance.now()
    rafId = requestAnimationFrame(tick)
  }

  function prune(cutoff: number) {
    const s = samples.value
    while (s.length && s[0].t < cutoff) s.shift()
  }

  function onMove(e: MouseEvent) {
    const t = performance.now()
    samples.value.push({ t, x: e.clientX, y: e.clientY })

    // keep memory bounded even during motion
    prune(t - windowMs)
  }

  onMounted(() => {
    window.addEventListener('mousemove', onMove, { passive: true })
    rafId = requestAnimationFrame(tick)
  })

  onUnmounted(() => {
    window.removeEventListener('mousemove', onMove)
    if (rafId != null) cancelAnimationFrame(rafId)
  })

  const last = computed(() => samples.value[samples.value.length - 1])

  const x = computed(() => last.value?.x ?? NaN)
  const y = computed(() => last.value?.y ?? NaN)

  function fitVelocity(axis: 'x' | 'y') {
    const tNow = now.value
    if (!Number.isFinite(tNow)) return NaN

    prune(tNow - windowMs)

    const s = samples.value
    if (s.length < 2) return 0

    const tLast = s[s.length - 1].t
    if (tNow - tLast > idleMs) return 0

    let sumT = 0, sumTT = 0, sumP = 0, sumTP = 0
    const n = s.length

    for (const p of s) {
      sumT += p.t
      sumTT += p.t * p.t
      sumP += p[axis]
      sumTP += p.t * p[axis]
    }

    // in seconds
    const denom = 0.001 * (n * sumTT - sumT * sumT)
    if (denom === 0) return 0

    return (n * sumTP - sumT * sumP) / denom // px/s
  }

  // Depend on now so these recompute even when mouse is still
  const vx = computed(() => (now.value, fitVelocity('x')))
  const vy = computed(() => (now.value, fitVelocity('y')))
  const speed = computed(() => Math.hypot(vx.value, vy.value))

  return { x, y, vx, vy, speed }
}