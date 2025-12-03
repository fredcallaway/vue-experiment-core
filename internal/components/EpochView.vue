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
    const part = parts[i]
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
  <div bg-gray-100 p-4 rounded-lg flex="~ col">
    <div flex="~ wrap justify-between">
      <div flex="~ items-center gap-2" text-sm>
        <template v-for="(epoch, index) in stack" :key="epoch.id">
          <span v-if="index > 0" text-gray-400>/</span>
          <span>{{ epoch._name }}</span>
          <template v-if="isMultistepEpoch(epoch)">
            <select v-if="isIndexableEpoch(epoch)"
              :value="epoch.step"
              @change="epoch.goTo(parseInt(($event.target as HTMLSelectElement).value))"
              bg-white border="~ 2 gray-300" px-1 py-0.5 text-xs
            >
              <option v-for="i in epoch.nSteps" :key="i-1" :value="i-1">{{ i-1 }}</option>
            </select>
            <span v-else>[{{ epoch.step.value }}]</span>
          </template>
        </template>
      </div>
      <div flex="~ items-center gap-2">
        <button btn-gray-xs v-for="(control, key) in globalControls" :key="key" @click="control">{{ key }}</button>
        <button btn-gray-xs w-11 @click="togglePin">{{ isPinned ? 'unpin' : 'pin' }}</button>
      </div>
    </div>

    <div v-if="bookmarks.length > 0" flex="~ wrap gap-2" mt-4>
      <div 
        v-for="(bookmark, index) in R.reverse(bookmarks)" 
        :key="index"
        bg-white p-2 border="~ 2 gray-300" w-35
      >
        <EditableText 
          v-model="bookmarks[bookmarks.length - 1 - index].name"
          class="font-bold text-sm w-full"
        />
        <EditableText 
          v-model="bookmarks[bookmarks.length - 1 - index].jump"
          class="text-xs text-gray-400 w-full"
        />

        <div flex="~ gap-2" mt-1>
          <button 
            @click="jumpToBookmark(bookmark.jump)"
            class="px-2 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
          >
            Jump
          </button>
          <button 
            @click="deleteBookmark(index)"
            class="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
    
    <div flex="~ items-center justify-end gap-2" mt2 float-right>
      fast mode
      <Toggle v-model="fast" />
    </div>
  </div>
</template>