# Imports

Vue/Nuxt framework APIs such as `ref`, `computed`, `onMounted`, and `useRoute` remain autoimported. Compiler macros such as `defineProps` and `defineEmits` need no imports. File-based components remain autoimported, including project components and their overrides.

Import every other function and type directly from its owning module:

```vue
<script setup lang="ts">
import { useEpoch } from '~/core/composables/useEpoch'
import { useLocalAsync } from '~/core/composables/useLocalAsync'
import type { SessionData } from '~/core/internal/data'
import { useEventListener } from '@vueuse/core'
import { useExperimentConfig } from '~/composables/useExperimentConfig'
import { provideTrialParams, type TrialParams } from './Trial.vue'

const epoch = useEpoch('trial')
const { sleep } = useLocalAsync()
const ready = ref(false)
</script>
```

The paths above illustrate module ownership; import only the dependencies your component uses. Within core, use relative imports. In project code, `~/core/...`, `~/composables/...`, or relative paths identify the owner. Use type-only imports for types so they do not evaluate a module at runtime. Importing a named value from an SFC evaluates its module-level declarations, including any data views it declares.

Core sets `imports.scan: false`; project `composables/`, `utils/`, and custom helper directories are not scanned. VueUse is a direct dependency imported from `@vueuse/core`. Helper imports from `#imports` must be replaced with owning-module imports. A project helper with the same export name as a core helper no longer shadows it implicitly: import the intended implementation at each call site. Component overrides still use Nuxt component discovery.

Keep module-level `defineParams`, event logger, and `declareDataView` declarations in the component that owns them. The examples manifest remains lazy: listing examples must not import their SFCs or register their data views. Type-only dependencies on an SFC must stay type-only.

`plugins/00.config.ts` initializes the project config before the app loads. The app imports the global RNG module explicitly so library calls to `Math.random` use the seeded stream even when no component directly references `random`. Preserve this initialization when overriding the app. See [the randomness decision](../adr/0010-seeded-global-randomness.md).

After migration, run `bun run typecheck` and `bun run build`. Check that generated `.nuxt/imports.d.ts` contains framework APIs but no project/core helpers or VueUse APIs, and smoke-test startup plus one relevant example. Detailed checks of every experiment flow belong to the release verification task.
