<script lang="ts" setup>

const message = ref('no message')


const P = useParticipant<{
  clickMe: string
}>()

P.on('clickMe', (button) => {  // button is now inferred as string
  message.value = `clickMe ${button} ${typeof button}`
})

const run = async () => {
  logDebug('running run')
  await P.promise('clickMe', (key) => key == 'X')
  logDebug('got key X')
  await P.promise('clickMe', (key) => key == 'C')
  logDebug('got key C')
  useCurrentEpoch().value.next()
}

onMounted(run)

</script>

<template>
<div>
  <div w150 h100 mx-auto p4 mt-4 relative>
    <ESequence ref="seq">
      <div>
        Press A B C (or X to move on)
        <PKey keys="A B C" @press="message = `PKey ${$event.key} ${$event.rt}ms`" />
        <EKey keys="X" />
      </div>
      
      <div>
        <PButtons values="A B C" mt-2 @click="message = `clicked ${$event}`" />
        <div flex-center gap-2 mt2>
          <button v-for="button in ['X', 'Y', 'Z', 'C']"
            :key="button" @click="P.emit('clickMe', button)"
            btn-gray
          >{{ button }}</button>
        </div>
      </div>

      <div>
        all done
      </div>

    </ESequence>
    
    <div mt-10 text-xl>{{ message }}</div>
  </div>
  <!-- <pre text-xs>{{ revEvents }}</pre> -->
</div>
</template>

<style>

</style>