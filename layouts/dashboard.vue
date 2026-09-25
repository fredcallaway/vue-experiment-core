<script setup lang="ts">

</script>

<template>
  <div class="min-w-1000px">
    <div class="sticky top-0 z-50 bg-white p2 bg-opacity-70 backdrop-blur-sm">
      <NavBar />
    </div>
    <div class="p2">
      <SizeScaler />
      <div>
        <slot />
      </div>
      <Inspector />
    </div>
  </div>
</template>

