<script lang="ts" setup>
useErrorLogging()
const { violated } = useWindowEnforcer()

const devTools = ref(!getUrlFlag('noDev'))

</script>

<template>
  <div p2 flex="~ col" overflow-hidden v-if="devTools">
    <NavBar mb-2/>
    <SizeScaler />
    <div flex="~ row gap-4">
      <div flex="~ col">
        <MainContent show-outline fixed-width fixed-height>
          <slot />
        </MainContent>
        <EpochView v-if="!violated" mt-3/>
      </div>

      <div w="600px" relative  v-if="!violated">
        <Inspector mb-2/>
        <EventView flex-1 ref="eventViewRef"/>
      </div>
    </div>
  </div>
  <div v-else >
    <NavBar mb-2/>
    <MainContent bg-white  >
      <Experiment />
    </MainContent>
  </div>
</template>


