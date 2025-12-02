<script lang="ts" setup>

</script>

<template>
  <ESequence name="experiment" p-20 text-center>
    <EPage name="page1" v-slot="{ epoch }">
      <p>Page 1</p>
      <PButton value="Next" @click="epoch.done()" />
    </EPage>
    <EPage name="page2">
      <p>Page 2 is the best!</p>
    </EPage>
  </ESequence>
</template>
