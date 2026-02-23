<script lang="ts" setup>

useErrorLogging()
const { violated } = useWindowEnforcer()

const devTools = ref(!getUrlFlag('noDev'))

// onMounted(() => {
//   // wait for loggers to load
//   setTimeout(() => {
//   }, 1000)
//     usePosthog()
// })

</script>

<template>
  <div p2 flex="~ col" overflow-hidden v-if="devTools">
    <NavBar mb-2/>
    <SizeScaler />
    <div flex="~ row gap-2">
      <div flex="~ col gap-2">
        <MainContent show-outline fixed-width fixed-height>
          <slot />
        </MainContent>
        <EpochView v-if="!violated" mt-3/>
        <!-- <EventView horizontal /> -->
      </div>

      <div flex="~ col gap-2" shrink-0>
        <EpochControls />
        <EpochOutline />
      </div>
      <div w="600px" relative  v-if="!violated">
        <Inspector mb-2/>
        <EventView flex-1 ref="eventViewRef"/>
      </div>
    </div>
  </div>
  <div v-else fixed inset-0 bg-gray-600 >
    <NavBar mb-2/>
    <div flex-center min-h-80vh>
      <MainContent bg-white border-4 fixed-width fixed-height>
        <Experiment />
      </MainContent>
    </div>
  </div>
</template>

