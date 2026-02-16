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
      <div flex="~ col gap-4">
        <MainContent show-outline fixed-width fixed-height>
          <slot />
        </MainContent>
        <!-- <EpochView v-if="!violated" mt-3/> -->
        <EventView horizontal />
      </div>

      <div w="600px" relative  v-if="!violated">
        <Inspector mb-2/>
        <EpochOutline />
        <!-- <EventView flex-1 ref="eventViewRef"/> -->
      </div>
    </div>
  </div>
  <template v-else >
    <div fixed inset-0 bg-gray-600 >
      <NavBar mb-2/>
      <div flex-center min-h-80vh>
        <MainContent bg-white border-4>
          <Experiment />
        </MainContent>
      </div>
    </div>
  </template>
</template>


