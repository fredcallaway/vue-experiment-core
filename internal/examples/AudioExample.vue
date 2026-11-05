<script lang="ts" setup>
import AudioTrial from './AudioTrial.vue'
</script>

<template>
  <ESequence name="main">
    <AudioTrial />
    <EPage name="end" class="p-6 text-center">
      Finished. The audioExample data view contains the recording metadata and save result.
    </EPage>
  </ESequence>
</template>
