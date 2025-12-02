<script lang="ts" setup>

defineWindowSize({ width: 500, height: 300 })

const reset = () => {
  window.location.reload()
  jumpToEpoch('main')
}

const currentEpoch = useCurrentEpoch()

const skipB1 = ref(false)

</script>

<template>
<div relative p-10 w-400px h-300px text-center>
  <div h-20>
    {{ currentEpoch.id }}
  </div>
  <ESequence name="main">
    <ESequence name="A">
      <EContinue button> A1 </EContinue>
      <EContinue button> A2 </EContinue>
      <EContinue button> A3 </EContinue>
    </ESequence>
    <EPage name="skipB1" v-slot="{ epoch }">
      <p>Do you want to skip B1?</p>
      <PButtons values="Yes No" @click="(val) => {skipB1 = (val == 'Yes'); epoch.done()}" />
    </EPage>
    <ESequence name="B">
      <EContinue button v-if="!skipB1"> B1 </EContinue>
      <EContinue button> B2 </EContinue>
      <EContinue button> B3 </EContinue>
    </ESequence>
    <EPage name="reset">
      <button btn-gray @click="reset">reset</button>
    </EPage>
  </ESequence>
  <div absolute bottom-3 right-3>
    <button btn-gray-sm @click="jumpToEpoch('B')">jump to B</button>
  </div>
</div>
</template>

<style>

</style>