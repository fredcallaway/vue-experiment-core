<script lang="ts" setup>
useErrorLogging()
const { violated } = useWindowEnforcer()

const devTools = ref(true)

</script>

<template>
  <div p2 flex="~ col" overflow-hidden v-if="devTools">
    <NavBar mb-2/>
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
  <div v-else flex-center min-h-80vh>
    <NavBar mb-2/>
    <MainContent bg-white fixed-width fixed-height >
      <Experiment />
    </MainContent>
  </div>
</template>


