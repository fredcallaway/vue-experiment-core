# Styling experiments

Use standard UnoCSS classes for layout, spacing, typography, colors, and icons:

```vue
<div class="flex flex-wrap items-center justify-center gap-4">
  <PButton value="Continue" />
  <span class="i-mdi-information text-blue-500" />
</div>
```

The project’s `uno.config.ts` re-exports [`core/uno.config.ts`](../../uno.config.ts). That shared configuration owns the Wind4 reset, icon preset, primary color theme, dynamic utility safelist, and button variants. Keep project-specific extensions in the project configuration.

## Buttons

`PButton` defaults to the primary color. Use `color="red"` for another supported color and `unstyled` for a fully custom stimulus. Native buttons can use `class="btn-primary"`.

The shared `btn-*` shortcuts are the one component-style family in the configuration. Their definition centralizes padding, rounding, text, hover colors, active feedback, and disabled behavior. Supported colors are `primary`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`, and `gray`; sizes are `xs`, `sm`, and `lg`. For example, `class="btn-red-sm"` selects a small red button. An explicit `btn-*` class on `PButton` replaces its default variant. `PButtons` accepts complete variants through its `classes` prop.

## Dynamic styling

Use complete class names for finite alternatives so the extractor can find them:

```ts
const inkClasses = { red: 'text-red', blue: 'text-blue' }
```

```vue
<span :class="inkClasses[ink]">{{ word }}</span>
```

The shared safelist supports dynamic background/text shades and button variants. If you introduce another finite family, use a literal class map or add its complete names to the project safelist.

Use scoped CSS for complex stimuli and bound CSS values for continuous values:

```vue
<div class="stimulus" :style="{ '--stimulus-color': color }" />

<style scoped>
.stimulus {
  background: var(--stimulus-color);
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
}
</style>
```

Standard utilities also work in scoped CSS through `@apply`. Keep geometry, transitions, and response-state styling close to the stimulus that owns them.
