<script lang="ts" setup>

definePageMeta({
  layout: 'bare',
})
// should be handled elsewhere but best to be safe

useDataWriter().disable()

const mode = assertOneOf<DataMode>(getUrlParam('mode'), ['debug', 'live'])
const sessionId = assertDefined<string>(getUrlParam('session_id'))
const epochId = getUrlParam('epoch') ?? undefined

const { events, isReady, isMissing, isLoading } = useSessionEvents(mode, sessionId)

// watchEffect(() => {
//   console.log('events', events.value)
//   console.log('isReady', isReady.value)
//   console.log('isMissing', isMissing.value)
//   console.log('isLoading', isLoading.value)
// })
</script>

<template>
  <div flex="~ col" px-1 ref="container" overflow-hidden >
    <NavBar mb-2/>
    <div v-if="isReady && events.length > 0" flex="~ row gap-4">
      <div flex="~ col">
        <MainContent show-outline fixed-width fixed-height>
          <Experiment />
        </MainContent>
        <PlaybackController :events="events" :epoch="epochId" mt-3/>
        <Inspector w-820px mt-2/>
      </div>

      <div w="400px" relative>
        <EventView flex-1 initial-filter="!debug." />
      </div>
      <div w="400px" relative>
        <PlaybackEventView  flex-1 />
      </div>
    </div>
    <div v-else-if="isLoading" flex-center h-40>
      loading playback data...
    </div>
    <div v-else-if="isMissing" flex-center h-40>
      <Error error="playback data not found" :info="{ sessionId, mode}" no-header />
    </div>
  </div>
</template>


