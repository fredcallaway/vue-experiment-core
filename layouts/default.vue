<script lang="ts" setup>
useErrorLogging()
const { violated } = useWindowEnforcer()

// Subscribe before the page logs experiment.condition (layout setup runs before page setup), so
// the Parameters panel's resolved-condition view catches it.
useLatestCondition()

// The dev tool overlay (Navigation + Parameters) floats bottom-right so it never displaces
// MainContent or the event log. Collapsible so it can be tucked away.
const devToolsOpen = useLocalStorage('devToolsOpen', true)
</script>

<template>
  <div p2 flex="~ col" ref="container" h-screen overflow-hidden>
    <NavBar mb-2 shrink-0 />
    <!-- Top row fills the remaining viewport height below NavBar; each panel scrolls internally. -->
    <div flex="~ row gap-4 items-stretch" flex-1 min-h-0 overflow-hidden>
      <!-- Participant UI, top-left, fixed size, no page scroll. -->
      <div flex="~ col" shrink-0 min-h-0 overflow-y-auto class="subtle-scrollbar">
        <MainContent show-outline fixed-width fixed-height>
          <slot />
        </MainContent>
      </div>

      <!-- Event log fills the remaining horizontal space; scrolls internally. -->
      <div flex="1 ~ col gap-2" min-w-0 min-h-0 v-if="!violated">
        <Inspector />
        <EventView flex-1 min-h-0 />
      </div>
    </div>

    <!-- Floating dev-tool overlay: Navigation + Parameters, bottom-right. -->
    <div
      v-if="!violated"
      fixed bottom-2 right-2 z-50
      flex="~ col items-end gap-2"
      class="max-h-[calc(100vh-1rem)]"
      style="pointer-events: none"
    >
      <button
        btn-gray btn-xs shrink-0
        style="pointer-events: auto"
        class="shadow-lg"
        @click="devToolsOpen = !devToolsOpen"
      >
        {{ devToolsOpen ? 'hide dev tools ▾' : 'dev tools ▴' }}
      </button>
      <div
        v-show="devToolsOpen"
        flex="~ col gap-2 items-stretch"
        min-h-0
        class="w-[380px] max-h-[calc(100vh-4rem)]"
        style="pointer-events: auto"
      >
        <div shrink-0 rounded-lg class="shadow-xl">
          <EpochView />
        </div>
        <div min-h-0 flex="~ col" rounded-lg overflow-hidden class="shadow-xl">
          <ParametersView flex-1 min-h-0 />
        </div>
      </div>
    </div>
  </div>
</template>
