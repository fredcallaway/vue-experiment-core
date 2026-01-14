<script lang="ts" setup>
// import { currentEpoch, type Epoch, type MultistepEpoch, type IndexableEpoch, jumpToEpoch } from '@/composables/useEpoch'

const currentEpoch = useCurrentEpoch()
// const currentEpochIndex = useCurrentEpochIndex()


const currentEpochIndex = computed(() => {
  const epochId = currentEpoch.value.id
  return epochId.substring(0, epochId.lastIndexOf(']') + 1)
})

const stack = computed(() => {
  const stack = []
  let epoch = currentEpoch.value
  while (epoch) {
    const skip = epoch.isLeaf || epoch._name == '__TOP_EPOCH__'
    if (!skip) {
      stack.push(epoch)
    }
    epoch = epoch._parent
  }
  return stack.reverse()
})

const isMultistepEpoch = (epoch: Epoch): epoch is MultistepEpoch => {
  return 'step' in epoch && 'nSteps' in epoch
}

const isIndexableEpoch = (epoch: Epoch): epoch is IndexableEpoch => {
  return 'step' in epoch && 'nSteps' in epoch && 'prev' in epoch && 'goTo' in epoch
}

const isPhaseEpoch = (epoch: Epoch): epoch is PhaseEpoch => {
  return 'phase' in epoch
}

const route = useRoute()
const router = useRouter()

const pinnedIndex = computed(() => route.query.jump as string | undefined)
const pinStatus = computed(() => {
  if (pinnedIndex.value === currentEpochIndex.value) return 'current'
  if (pinnedIndex.value !== undefined) return 'other'
  return 'none'
})

// useInspect({
//   pinnedIndex, 
//   currentEpochIndex,
//   pinStatus, 
//   currentEpochId: () => currentEpoch.value.id,
//   // stack: () => stack.value.map(e => e.id),
// })

const cyclePin = () => {
  const newPin = pinStatus.value == 'current' ? undefined : currentEpochIndex.value
  router.push({
    query: { ...route.query, jump: newPin }
  })
}

const handleEpochChange = async (epoch: Epoch, newValue: string | number) => {
  if (isPhaseEpoch(epoch)) {
    epoch.goTo(newValue as string)
  } else if (isIndexableEpoch(epoch)) {
    const idx = assertNumber(newValue)
    epoch.goTo(idx)
  }
  
  if (pinStatus.value != 'none') {
    const jump = epoch.id + '[' + newValue + ']'
    await nextTick()
    router.push({ query: { ...route.query, jump } })
  }
}

// Bookmarks
const bookmarks = useLocalStorage<Record<string, string>>('bookmarks', {})


const getDefaultBookmarkName = (epochId: string) => {
  const skipNames = [
    'EContinue',
    'EPage',
    'ERepeat',
    'EDelay',
    'EWait',
    'EKey',
    'EButtons',
  ]
  const parts = epochId.split('-')
  let name = R.last(parts)!.replace('[0]', '')
  while (skipNames.includes(name)) {
    parts.pop()
    name = R.last(parts)!.replace('[0]', '')
  }
  return name
}

const isBookmarked = computed(() => currentEpochIndex.value! in bookmarks.value)

const toggleBookmark = () => {
  const epochId = currentEpoch.value.id
  const jump = currentEpochIndex.value!
  if (isBookmarked.value) {
    delete bookmarks.value[jump]
  } else {
    bookmarks.value[jump] = getDefaultBookmarkName(epochId)
  }
}

const jumpToBookmark = async (jump: string) => {
  try {
    router.push({ query: { ...route.query, jump } })
    await jumpToEpoch(jump)
  } catch (e) {
    console.error('jump not found:', jump)
  }
}

const deleteBookmark = (jump: string) => {
  delete bookmarks.value[jump]
}

const sortedBookmarkKeys = computed(() => {
  return Object.keys(bookmarks.value).sort()
})

const handleNext = () => {
  if (currentEpoch.value._name == 'EPage') {
    currentEpoch.value.done()
  } else {
    currentEpoch.value.next()
  }
}

const handleCopy = () => {
  navigator.clipboard.writeText(currentEpoch.value.id)
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
          <template v-if="isPhaseEpoch(epoch)">
            <select
              :value="epoch.phase"
              @change="handleEpochChange(epoch, ($event.target as HTMLSelectElement).value)"
              bg-white border="~ 2 gray-300" px-1 py-0.5 text-xs
            >
              <option v-for="p in epoch.phases" :key="p" :value="p">{{ p }}</option>
            </select>
          </template>
          <template v-else-if="isMultistepEpoch(epoch)">
            <select v-if="isIndexableEpoch(epoch)"
              :value="epoch.step"
              @change="handleEpochChange(epoch, parseInt(($event.target as HTMLSelectElement).value))"
              bg-white border="~ 2 gray-300" px-1 py-0.5 text-xs
            >
              <option v-for="i in epoch.nSteps" :key="i-1" :value="i-1">{{ i-1 }}</option>
            </select>
            <span v-else>[{{ epoch.step.value }}]</span>
          </template>
        </template>
      </div>
      <div flex="~ items-center gap-2">
        <button @click="handleCopy">
          <div i-mdi-clipboard-multiple text-2xl text-gray-400 hover:text-gray-700
            active:translate-y-0.1 active:scale-94 transition-transform duration-75
           />
        </button>
        <button @click="handleNext">
          <div i-mdi-arrow-right-bold-box text-2xl text-gray-400 hover:text-gray-700
            active:translate-y-0.1 active:scale-94 transition-transform duration-75
           />
        </button>
        <button @click="toggleBookmark">
          <div i-mdi-bookmark text-2xl :class="[
            isBookmarked ? 'text-blue-500' : 'text-gray-300'
            ]"
          />
        </button>
        <button @click="cyclePin">
          <div text-2xl :class="[
            pinStatus == 'other' ? 'i-mdi-pin-outline' : 'i-mdi-pin',
            pinStatus != 'none' ? 'text-blue-500' : 'text-gray-300'
            ]"
          />
        </button>
        <button @click="fast = !fast">
          <div i-mdi-speedometer text-2xl :class="[
            fast ? 'text-blue-500' : 'text-gray-300'
            ]"
          />
        </button>
      </div>
    </div>

    <div v-if="Object.keys(bookmarks).length > 0" flex="~ wrap gap-2" mt-4>
      <div 
        v-for="jump in sortedBookmarkKeys" 
        :key="jump"
        bg-white p-2 border="~ 2 gray-300" w-40
      >
        <EditableText 
          v-model="bookmarks[jump]"
          class="font-bold text-sm w-full ml--1"
        />
        <div class="text-10px text-gray-400 w-full">{{ jump }}</div>

        <div flex="~ gap-2" mt-1>
          <button 
            @click="jumpToBookmark(jump)"
            class="px-2 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
          >
            Jump
          </button>
          <button 
            @click="deleteBookmark(jump)"
            class="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>