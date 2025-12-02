<script setup lang="ts">
const props = defineProps<{
  id?: string
  defaultTab?: number
}>()

const activeTabIndex = props.id
  ? useSessionStorage(`tab-${props.id}`, props.defaultTab ?? 0)
  : ref(props.defaultTab ?? 0)

const tabTitles = ref<string[]>([])

provide('registerTab', (title: string) => {
  const index = tabTitles.value.length
  tabTitles.value.push(title)
  const thisTabActive = computed(() => activeTabIndex.value === index)
  return thisTabActive
})

</script>

<template>
  <div class="mt-6">
    <div flex="~ row gap-0">
      <button
        v-for="(title, idx) in tabTitles"
        :key="idx"
        @click="activeTabIndex = idx"
        px-4 py-2
        :class="[
          'border-t border-l border-r border-gray-300',
          idx > 0 ? '-ml-px' : '',
          activeTabIndex === idx 
            ? 'bg-white border-b-white -mb-px relative z-10' 
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        ]"
      >
        {{ title }}
      </button>
    </div>

    <div class="mt-0 border border-1 border-gray-300 p-4">
      <slot />
    </div>
  </div>
</template>
