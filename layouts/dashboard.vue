<script setup lang="ts">

</script>

<template>
  <div min-w-1000px p2>
    <NavBar />
    <SizeScaler />
    <div>
      <slot />
    </div>
    <Inspector />
  </div>
</template>

