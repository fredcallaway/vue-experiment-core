<script lang="ts" setup>

useErrorLogging()
const { violated } = useWindowEnforcer()
const mounted = useMounted()

// The hidden outline-worker iframe loads this layout with ?outlineWorker=1 (and ?noDev). It must
// run the bare experiment with no dev chrome, force debug mode so its DataWriter never touches the
// real session, and mount the worker driver that runs the traversal. See ADR 0003.
const isOutlineWorker = getUrlFlag('outlineWorker')
if (isOutlineWorker) useCurrentSession().mode = 'debug'

const devTools = ref(!getUrlFlag('noDev'))

provide('devTools', devTools)

// uncomment if you want posthog diagnostics when running the experiment through /dev (not live)
// usePosthog()

</script>

<template>
  <div p2 flex="~ col" overflow-hidden v-if="devTools">
    <NavBar mb-2/>
    <SizeScaler />
    <div flex="~ row gap-2">
      <div flex="~ col gap-2">
        <MainContent show-outline fixed-width fixed-height capture-errors >
          <slot  v-if="mounted" />
        </MainContent>
        <!-- <EventView horizontal /> -->
      </div>

      <div flex="~ col gap-2" shrink-0>
        <EpochControls />
        <EpochOutline />
      </div>
      <div w="600px" relative  v-if="!violated">
        <Inspector mb-2/>
        <ConditionView mb-2/>
        <DataView mb-2/>
        <EventView flex-1 ref="eventViewRef"/>
      </div>
    </div>
    <!-- Produces the outline off this tab so it never has to traverse/reload (ADR 0003). -->
    <OutlineWorkerFrame />
  </div>
  <div v-else fixed inset-0 bg-gray-600 >
    <NavBar mb-2/>
    <div flex-center min-h-80vh>
      <MainContent bg-white border-4 fixed-width fixed-height>
        <!-- Render the actual page content (the route's component), not a hardcoded <Experiment />:
             the outline worker loads non-/dev routes (e.g. /examples/<slug>) here too and must traverse
             that page's timeline. On /dev the slot is <Experiment />, so preview is unchanged. -->
        <slot v-if="mounted" />
      </MainContent>
    </div>
    <OutlineWorkerDriver v-if="isOutlineWorker" />
  </div>
</template>
