<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <DocsPage name="params">
    <h3>Params</h3>
    <p>
      A trial component almost always has knobs: how long the fixation cross shows, how many
      options appear, what the target color is. <code>defineParams</code> declares those knobs
      once, at module level, with defaults that double as their types.
    </p>
    <DemoCode code="
      // in the component's plain <script> block (not setup)
      export const [provideProbeParams, useProbeParams] = defineParams({
        color: 'steelblue',
        size: 80,
      })
      export type ProbeParams = ReturnType<typeof useProbeParams>
    "/>
    <p>
      The component then resolves its own params in <code>setup</code>, accepting per-instance
      overrides through a <code>params</code> prop:
    </p>
    <DemoCode code="
      const props = defineProps<{ params?: Partial<ProbeParams> }>()
      const params = useProbeParams(props.params)
    "/>
    <p>
      Two things are worth noticing here. The defaults live at <b>module level</b>, so they're
      written once and shared by every instance; and the params are read <b>inside</b> the
      component rather than threaded down as props, so adding a knob doesn't mean editing
      every ancestor that renders it.
    </p>

    <h3>Three layers of override</h3>
    <p>Values resolve from three sources, each overriding the one before it:</p>
    <ol>
      <li><b>Defaults</b> — the object passed to <code>defineParams</code>.</li>
      <li>
        <b>Subtree</b> — <code>provideProbeParams({ size: 60 })</code> in an ancestor's setup
        sets the default for every instance below it. This is how a block applies one setting
        to all of its trials.
      </li>
      <li>
        <b>Instance</b> — the <code>params</code> prop on a single tag. Closest wins.
      </li>
    </ol>
    <DemoCode code='
      // an ancestor: everything below defaults to size 60
      provideProbeParams({ size: 60 })
    '/>
    <DemoCode code='
      <ProbeTrial />                                        <!-- steelblue, 60 -->
      <ProbeTrial :params="{ color: &apos;tomato&apos; }" />          <!-- tomato, 60 -->
      <ProbeTrial :params="{ color: &apos;seagreen&apos;, size: 100 }" />  <!-- seagreen, 100 -->
    '/>
    <p>
      Overrides are merged per key, not wholesale: overriding <code>color</code> leaves
      <code>size</code> at whatever the layer above it decided. See the
      <NuxtLink to="/examples/params">params example</NuxtLink>, which renders exactly the
      three instances above.
    </p>

    <h3>Computed defaults</h3>
    <p>
      A default can be a function instead of a value, in which case it's called each time
      params are resolved rather than once when the module loads. Use this when a default
      depends on something that isn't known at module scope — a condition, the window size,
      whether fast mode is on:
    </p>
    <DemoCode code="
      export const [provideTrialParams, useTrialParams] = defineParams({
        nOptions: 4,
        feedbackMs: () => replaceFast(800, 0),  // 0 when fast mode is on
      })
    "/>

    <h3>Params are resolved once</h3>
    <p>
      <code>useParams()</code> returns plain values, not a reactive object. It resolves the
      three layers at the moment you call it — normally in <code>setup</code> — and the result
      does not update if the <code>params</code> prop later changes.
    </p>
    <p>
      This is deliberate: a trial's settings shouldn't shift underneath it mid-trial. Give
      each configuration its own component instance instead, which is what
      <code>ERepeat</code> already does — every iteration is a fresh instance that resolves
      its own params.
    </p>
    <div card-info>
      If you genuinely need a value to change while a component stays mounted, don't reach for
      params: pass a <code>computed</code> or a ref as an ordinary prop. Mixing the two mental
      models is a reliable source of confusion.
    </div>
    <p>
      So: params shape <em>this instance</em>. For a value that must stay fixed for a
      participant across the whole session — and be balanced across participants — use a
      condition instead, and let it feed the params.
    </p>
  </DocsPage>
</template>
