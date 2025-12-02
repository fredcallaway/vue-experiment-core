<script lang="ts" setup>
useErrorLogging()
const { violated } = useWindowEnforcer()

</script>

<template>
  <div flex="~ col" px-1 ref="container" overflow-hidden >
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
</template>


