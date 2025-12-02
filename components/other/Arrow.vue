<script setup lang="ts">
const props = defineProps<{
  x?: number | string
  y?: number | string
  length?: number | string
  rot?: number | string
  width?: number | string // line width
}>()

const endX = ensureNumber(props.x ?? 0)
const endY = ensureNumber(props.y ?? 0)
const length = ensureNumber(props.length || '100')
const rotationDegrees = ensureNumber(props.rot || '3') - 3
const rotationRadians = (30*rotationDegrees * Math.PI) / 180
const width = ensureNumber(props.width || '3')

const startX = endX + length * Math.cos(rotationRadians)
const startY = endY + length * Math.sin(rotationRadians)

</script>

<template>
  <svg :width="Math.abs(startX - endX) + 20" :height="Math.abs(startY - endY) + 20" style="position: absolute; pointer-events: none; overflow: visible">
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
      </marker>
    </defs>
    <line 
      :x1="startX" 
      :y1="startY" 
      :x2="endX" 
      :y2="endY" 
      stroke="currentColor" 
      :stroke-width="width"
      marker-end="url(#arrowhead)" 
    />
  </svg>
</template>