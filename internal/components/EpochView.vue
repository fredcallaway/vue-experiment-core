<script lang="ts" setup>
// import { currentEpoch, type Epoch, type MultistepEpoch, type IndexableEpoch, jumpToEpoch } from '@/composables/useEpoch'

type Bookmark = {
  name: string
  jump: string
}

const bookmarks = useLocalStorage<Bookmark[]>('bookmarks', [])
const currentEpoch = useCurrentEpoch()

const stack = computed(() => {
  const stack = []
  let epoch = currentEpoch.value
  while (epoch) {
    stack.push(epoch)
    epoch = epoch._parent
  }

  return stack.slice(0, -1).reverse() // remove TOP_EPOCH
})

const isMultistepEpoch = (epoch: Epoch): epoch is MultistepEpoch => {
  return 'step' in epoch && 'nSteps' in epoch
}

// The epochs reach the template through a reactive wrapper that auto-unwraps the nested `step`
// ref, so `epoch.step.value` is undefined there (which silently broke the current-slot
// highlight). unref() handles both the raw-ref and unwrapped shapes.
const stepOf = (epoch: MultistepEpoch) => unref(epoch.step)

const isIndexableEpoch = (epoch: Epoch): epoch is IndexableEpoch => {
  return 'step' in epoch && 'nSteps' in epoch && 'prev' in epoch && 'goTo' in epoch
}

const route = useRoute()
const router = useRouter()

const isPinned = computed(() => route.query.jump !== undefined)

const togglePin = () => {
  const { jump, ...rest } = route.query
  router.push({
    query: isPinned.value ? rest : { ...route.query, jump: currentEpoch.value.id }
  })
}

const getDefaultBookmarkName = () => {
  const epochId = currentEpoch.value.id
  const parts = epochId.split('-')
  
  const skipComponents = ['EKey', 'EPage', 'EContinue']
  
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]!
    if (skipComponents.includes(part)) continue
    return part.replace(/\[(\d+)\]/, (_, num) => ` ${parseInt(num) + 1}`)
  }
  
  return epochId
}

const addBookmark = () => {
  const name = getDefaultBookmarkName()
  bookmarks.value.push({ name, jump: currentEpoch.value.id })
}

const deleteBookmark = (index: number) => {
  bookmarks.value.splice(bookmarks.value.length - 1 - index, 1)
}

const jumpToBookmark = async (jump: string) => {
  try {
    router.push({ query: { ...route.query, jump } })
    await jumpToEpoch(jump)
  } catch (e) {
    console.error('jump not found:', jump)
  }
}

const globalControls = {
  'next': () => {
    if (currentEpoch.value._name == 'EPage') {
      currentEpoch.value.done()
    } else {
      currentEpoch.value.next()
    }
  },
  'copy': () => {
    navigator.clipboard.writeText(currentEpoch.value.id)
  },
  'bookmark': addBookmark,
}

const fast = useFastMode()

</script>

<template>
  <div bg-gray-100 p-3 rounded-lg flex="~ col gap-2" class="max-h-[40vh] overflow-y-auto subtle-scrollbar">
    <div flex="~ items-center justify-between">
      <span font-bold text-sm>Navigation</span>
      <div flex="~ items-center gap-1">
        <button btn-gray-xs v-for="(control, key) in globalControls" :key="key" @click="control">{{ key }}</button>
        <button btn-gray-xs @click="togglePin">{{ isPinned ? 'unpin' : 'pin' }}</button>
      </div>
    </div>

    <!-- Clickable epoch outline, transposed: each nesting level is a COLUMN laid left→right,
         wrapping onto new lines when the chain is deep (no horizontal scrolling); a level's steps
         are a compact grid within its column (current step highlighted). -->
    <div flex="~ row wrap gap-x-2 gap-y-1.5 items-start" text-sm pb-1>
      <template v-for="(epoch, index) in stack" :key="epoch.id">
        <span v-if="index > 0" self-center text-gray-300 select-none shrink-0>→</span>
        <div flex="~ col gap-0.5" shrink-0>
          <!-- "You are here": the experiment-level column (first) gets a light pill, the current
               (deepest) epoch's column a solid one; the blue step button marks the slot within. -->
          <span
            font-medium text-xs whitespace-nowrap rounded px-1.5 py-0.5 self-start
            :class="index === stack.length - 1
              ? 'bg-primary-600 text-white'
              : index === 0 ? 'bg-primary-100 text-primary-700' : 'text-gray-700'"
          >{{ epoch._name }}</span>
          <!-- Steps as a compact wrap-grid (4-up) so long sequences (e.g. 28 journeys) stay short
               and the panel doesn't need scrolling. -->
          <div v-if="isIndexableEpoch(epoch)" grid grid-cols-4 gap-0.5>
            <button
              v-for="i in epoch.nSteps"
              :key="i - 1"
              @click="epoch.goTo(i - 1)"
              border="~ gray-300" rounded text-center leading-tight min-w-5 px-0.5
              style="font-size: 10px; padding-top: 1px; padding-bottom: 1px"
              :class="stepOf(epoch) === i - 1 ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-200'"
            >{{ i - 1 }}</button>
          </div>
          <span v-else-if="isMultistepEpoch(epoch)" text-gray-500 text-xs>[{{ stepOf(epoch) }}]</span>
        </div>
      </template>
    </div>

    <div flex="~ items-center justify-end gap-2" text-xs>
      fast mode
      <Toggle v-model="fast" />
    </div>

    <div v-if="bookmarks.length > 0" flex="~ col gap-1" border-t="~ gray-200" pt-2>
      <div
        v-for="(bookmark, index) in R.reverse(bookmarks)"
        :key="index"
        bg-white p-1.5 border="~ gray-200" rounded flex="~ col gap-1"
      >
        <EditableText
          v-model="bookmarks[bookmarks.length - 1 - index]!.name"
          class="font-bold text-xs w-full"
        />
        <div flex="~ gap-1">
          <button @click="jumpToBookmark(bookmark.jump)" class="px-2 py-0.5 text-xs bg-green-500 hover:bg-green-600 text-white rounded">Jump</button>
          <button @click="deleteBookmark(index)" class="px-2 py-0.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>