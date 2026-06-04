<script lang="ts">

// The "params" tutorial. Two related mechanisms for making an experiment
// configurable and counterbalanced:
//
//   defineParams   — typed, defaulted settings, overridable per-instance via a
//                    `params` prop. Used by almost every epoch (EClickTest, CustomEpochDemo).
//   useConditions  — between-subject assignment (which variant a participant gets),
//                    cycling across sessions and pinnable from the dev UI.
//
// Keep them straight: params shape *this render*; conditions decide *which participant
// gets what*, and typically feed into params.

// A small set of display params with defaults. Defining it at module scope means the
// `provide`/`use` pair is shared by every instance of the component below.
export const [provideSwatchParams, useSwatchParams] = defineParams({
  color: 'blue',
  size: 80,
})
export type SwatchParams = ReturnType<typeof useSwatchParams>

</script>

<script lang="ts" setup>

// A trivial component driven entirely by params, so overrides are visible at a glance.
const Swatch = defineComponent({
  props: { params: { type: Object as PropType<Partial<SwatchParams>>, default: undefined } },
  setup(props) {
    const p = useSwatchParams(props.params)
    return () => h('div', { class: 'flex-col flex-center gap-2' }, [
      h('div', {
        style: { width: `${p.size}px`, height: `${p.size}px`, background: p.color },
        class: 'rounded',
      }),
      h('code', { class: 'text-xs' }, `color=${p.color} size=${p.size}`),
    ])
  },
})

// Conditions. choice(...) assigns one value per key for this session; permute(...)
// assigns one ordering of the values. Assignment cycles across sessions so variants
// are balanced. The dev UI's condition inspector lists these and lets you *pin* one.
const { conditions, isPinned, choice, permute } = useConditions()
const assigned = choice({
  layout: ['grid', 'list'],
  reward: ['low', 'high'],
})
const order = permute('cueOrder', ['A', 'B', 'C'])

</script>

<template>
  <div p4>
    <ESequence name="params">

      <!-- ===================== Intro ===================== -->
      <EContinue name="intro" flex-col gap-3>
        <h2 text-xl font-bold>Parameters and conditions</h2>
        <p>
          <code>defineParams</code> gives an epoch typed, defaulted settings you can
          override per instance. <code>useConditions</code> assigns between-subject
          variants that cycle across sessions and can be pinned from the dev UI.
        </p>
      </EContinue>

      <!-- ===================== Params ===================== -->
      <EContinue name="paramsOverrides" flex-col gap-4>
        <h3 font-bold>Params overrides</h3>
        <p text-sm text-gray-600>
          The same <code>Swatch</code> component, rendered three times. Defaults apply
          unless a <code>:params</code> prop overrides them — overrides are per instance
          and independent.
        </p>
        <div flex gap-8 items-end>
          <Swatch />
          <Swatch :params="{ color: 'tomato' }" />
          <Swatch :params="{ color: 'seagreen', size: 120 }" />
        </div>
      </EContinue>

      <!-- ===================== Conditions ===================== -->
      <EPage name="conditions" flex-col gap-4>
        <h3 font-bold>Conditions</h3>
        <p text-sm text-gray-600>
          Assigned for this session below. Open the dev UI (<code>/dev</code>) to see the
          condition inspector, where each can be <b>pinned</b> — pinned values are written
          to <code>condition.&lt;key&gt;</code> URL params, and the assignment counter
          only cycles over <i>un-pinned</i> conditions. Reload to see assignment advance.
        </p>
        <table text-sm b-1 b-gray-200 rounded>
          <thead bg-gray-50>
            <tr><th p2 text-left>key</th><th p2 text-left>assigned</th><th p2 text-left>pinned?</th></tr>
          </thead>
          <tbody>
            <tr b-t b-gray-100>
              <td p2><code>layout</code></td><td p2>{{ assigned.layout }}</td>
              <td p2>{{ isPinned.layout ? 'yes' : 'no' }}</td>
            </tr>
            <tr b-t b-gray-100>
              <td p2><code>reward</code></td><td p2>{{ assigned.reward }}</td>
              <td p2>{{ isPinned.reward ? 'yes' : 'no' }}</td>
            </tr>
            <tr b-t b-gray-100>
              <td p2><code>cueOrder</code></td><td p2>{{ order.join(', ') }}</td>
              <td p2>{{ isPinned.cueOrder ? 'yes' : 'no' }}</td>
            </tr>
          </tbody>
        </table>
        <p text-xs text-gray-500>
          Conditions usually feed into params — e.g. <code>:params="{ count: reward === 'high' ? 20 : 5 }"</code>.
          Reactive condition state: <code>{{ JSON.stringify(conditions) }}</code>
        </p>
      </EPage>

    </ESequence>
  </div>
</template>
