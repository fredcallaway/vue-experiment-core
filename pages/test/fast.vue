<script lang="ts" setup>

const fast = useFastMode()
const slow = ref(100)
declareFast(slow, 10)

const slowObj = reactive({
  a: 100,
  b: 200,
})

declareFast(toRefs(slowObj).a, 10)

</script>
<template>
<div w-100 h-100>
  <div>slow: {{ slow }}</div>
  <div>slowObj.a: {{ slowObj.a }}</div>
  <div>slowObj.b: {{ slowObj.b }}</div>
  <button @click="fast = !fast">{{ fast ? 'slow down' : 'speed up' }}</button>
  <div>{{ fast }}</div>
</div>
</template>