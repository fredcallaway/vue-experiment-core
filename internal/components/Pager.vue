<script setup lang="ts" generic="T">
const props = defineProps<{
  items: T[]
  defaultPage?: number
}>()

console.log('Pager', props.items)

const currentPage = ref(props.defaultPage ?? 0)
const totalPages = computed(() => props.items.length)

const nextPage = () => {
  if (currentPage.value < totalPages.value - 1) {
    currentPage.value++
  }
}

const prevPage = () => {
  if (currentPage.value > 0) {
    currentPage.value--
  }
}
const currentItem = computed(() => props.items[currentPage.value])

// inspect({currentPage, currentItem})

</script>

<template>
  <div>
    <div v-if="totalPages > 1" flex="~ row gap-2 items-center" >
      <button
        @click="prevPage"
        :disabled="currentPage === 0"
        
        :class="currentPage === 0 ? 'opacity-50 cursor-not-allowed' : ''"
      >
        ←
      </button>
      <div text-sm text-gray-600>
        {{ currentPage + 1 }} / {{ totalPages }}
      </div>
      <button
        @click="nextPage"
        :disabled="currentPage === totalPages - 1"
        
        :class="currentPage === totalPages - 1 ? 'opacity-50 cursor-not-allowed' : ''"
      >
         →
      </button>
    </div>
    <div v-if="currentItem !== undefined">
      <slot :item="currentItem" :key="currentPage" />
    </div>
  </div>
</template>

