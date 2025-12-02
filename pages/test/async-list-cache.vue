<script setup lang="ts">

definePageMeta({
  layout: 'dashboard',
})

interface TestItemShort {
  id: string
  name: string
  status: 'AWAITING REVIEW' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'
  created: number
}

interface TestItemFull extends TestItemShort {
  description: string
  details: string[]
}

// Configuration
const config = {
  pageSize: 3,
  fetchDelayMs: 800,
  numBackendItems: 4,
}

// Mock backend storage
const mockBackend = ref<TestItemFull[]>([])

// Logs
const logs = ref<Array<{ time: string, message: string, type: 'info' | 'success' | 'warning' }>>([])

const addLog = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
  const time = new Date().toLocaleTimeString()
  logs.value.push({ time, message, type })
  console.log(`[Test] ${message}`)
}

// Initialize mock backend
const resetBackend = () => {
  mockBackend.value = Array.from({ length: config.numBackendItems }, (_, i) => ({
    id: `item-${config.numBackendItems - i}`,
    name: `Item ${config.numBackendItems - i}`,
    status: i < 2 ? 'AWAITING REVIEW' : i < 4 ? 'ACTIVE' : i < 6 ? 'PAUSED' : 'COMPLETED',
    created: Date.now() - (i * 60000), // Each item 1 minute apart
    description: `This is item ${config.numBackendItems - i}`,
    details: [`Detail XX for item ${config.numBackendItems - i}`, `Detail B for item ${config.numBackendItems - i}`]
  }))
  addLog(`Backend reset with ${mockBackend.value.length} items`, 'info')
}

const addNewItem = () => {
  const newId = `item-${Date.now()}`
  mockBackend.value.unshift({
    id: newId,
    name: `New Item ${mockBackend.value.length + 1}`,
    status: 'ACTIVE',
    created: Date.now(),
    description: `New item description`,
    details: ['New detail A', 'New detail B']
  })
  addLog(`Added new item: ${newId}`, 'success')
}

// Async generator that mimics Prolific's multi-endpoint fetching
const fetchItemList = async function*(): AsyncGenerator<TestItemShort[], void, unknown> {
  addLog('🔄 Starting list fetch...', 'info')

  // 1. First page of all items (immediate)
  await new Promise(resolve => setTimeout(resolve, config.fetchDelayMs))
  const firstPage = mockBackend.value.slice(0, config.pageSize).map(item => ({
    id: item.id,
    name: item.name,
    status: item.status,
    created: item.created
  }))
  addLog(`✅ Yielding first page (${firstPage.length} items)`, 'success')
  yield firstPage

  // 2. Status-specific queries (in parallel, but yield sequentially)
  const statuses: TestItemShort['status'][] = ['AWAITING REVIEW', 'ACTIVE', 'PAUSED']

  for (const status of statuses) {
    await new Promise(resolve => setTimeout(resolve, config.fetchDelayMs))
    const statusItems = mockBackend.value
      .filter(item => item.status === status)
      .map(item => ({
        id: item.id,
        name: item.name,
        status: item.status,
        created: item.created
      }))

    if (statusItems.length > 0) {
      addLog(`✅ Yielding ${status} items (${statusItems.length} items)`, 'success')
      yield statusItems
    }
  }

  // 3. Remaining pages
  let page = 2
  while (true) {
    const start = (page - 1) * config.pageSize
    const end = start + config.pageSize
    const pageItems = mockBackend.value.slice(start, end)

    if (pageItems.length === 0) break

    await new Promise(resolve => setTimeout(resolve, config.fetchDelayMs))

    const shortItems = pageItems.map(item => ({
      id: item.id,
      name: item.name,
      status: item.status,
      created: item.created
    }))

    addLog(`✅ Yielding page ${page} (${shortItems.length} items)`, 'success')
    yield shortItems

    page++
  }

  addLog('🏁 List fetch complete', 'success')
}

// Fetch individual item (full details)
const fetchItem = async (id: string): Promise<TestItemFull> => {
  addLog(`🔍 Fetching full details for ${id}`, 'info')

  await new Promise(resolve => setTimeout(resolve, config.fetchDelayMs / 2))

  const item = mockBackend.value.find(i => i.id === id)
  if (!item) {
    throw new Error(`Item ${id} not found`)
  }

  addLog(`✅ Fetched full details for ${id}`, 'success')
  return { ...item }
}

// Create cache
const cache = useAsyncListCache<TestItemShort, TestItemFull>({
  storageKey: 'test-async-list-cache',
  fetchList: fetchItemList,
  fetchItem: fetchItem,
  getItemId: (item) => item.id,
  minRefreshInterval: 10000, // 10 seconds
})

// Get list interface
const list = cache.getListCache()

// Selected item for detail view
const selectedItemId = ref<string | null>(null)
const selectedItem = computed(() => {
  if (!selectedItemId.value) return null
  return cache.getItemCache(selectedItemId.value)
})

const selectItem = (id: string) => {
  selectedItemId.value = id
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'AWAITING REVIEW': return '#ff9800'
    case 'ACTIVE': return '#4caf50'
    case 'PAUSED': return '#2196f3'
    case 'COMPLETED': return '#9e9e9e'
    default: return '#ccc'
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'AWAITING REVIEW': return '⏳'
    case 'ACTIVE': return '▶️'
    case 'PAUSED': return '⏸️'
    case 'COMPLETED': return '✅'
    default: return '❓'
  }
}

// Initialize
onMounted(() => {
  resetBackend()
  addLog('Test page loaded', 'info')
})
</script>

<template>
  <div style="padding: 2rem; max-width: 1800px; margin: 0 auto;">
    <h1>Async List Cache Test Page</h1>
    <p style="color: #666; margin-bottom: 2rem;">
      Demonstrates streaming updates with async generator pattern. Watch items appear incrementally!
    </p>

    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 2rem; margin-top: 2rem;">
      <!-- Left: Backend Control -->
      <div style="border: 1px solid #ccc; padding: 1rem; border-radius: 4px;">
        <h2>Mock Backend ({{ mockBackend.length }} items)</h2>

        <div style="margin-bottom: 1rem;">
          <button @click="addNewItem" style="padding: 0.5rem 1rem; margin-right: 0.5rem;">
            Add New Item
          </button>
          <button @click="resetBackend" style="padding: 0.5rem 1rem;">
            Reset Backend
          </button>
        </div>

        <div style="max-height: 600px; overflow-y: auto; border: 1px solid #eee; padding: 0.5rem;">
          <div v-for="item in mockBackend" :key="item.id" style="margin-bottom: 0.5rem; padding: 0.5rem; background: #f5f5f5; border-radius: 4px; font-size: 0.85rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="margin-right: 0.3rem;">{{ getStatusIcon(item.status) }}</span>
                <b>{{ item.name }}</b>
              </div>
              <select v-model="item.status" style="padding: 0.2rem; font-size: 0.8rem;">
                <option value="AWAITING REVIEW">AWAITING REVIEW</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED">PAUSED</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </div>
            <div style="font-size: 0.75rem; color: #666; margin-top: 0.2rem;">
              ID: {{ item.id }}
            </div>
          </div>
        </div>
      </div>

      <!-- Middle: Cached List -->
      <div style="border: 1px solid #ccc; padding: 1rem; border-radius: 4px;">
        <h2>Cached List</h2>

        <div style="margin-bottom: 1rem;">
          <div style="margin-bottom: 0.5rem;">
            <b>Status:</b>
            <span v-if="list.isLoading.value">🔄 Refreshing...</span>
            <span v-else-if="list.items.value.length > 0">✅ Ready</span>
            <span v-else>⏸️ Empty</span>
          </div>

          <div style="margin-bottom: 0.5rem;">
            <b>timestamp:</b> {{ list.timestamp.value ?? 'null' }}
          </div>

          <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
            <button @click="list.refresh()" style="padding: 0.5rem 1rem;">
              Refresh List
            </button>
            <button @click="cache.clear()" style="padding: 0.5rem 1rem;">
              Clear Cache
            </button>
          </div>
        </div>

        <div style="max-height: 600px; overflow-y: auto; border: 1px solid #eee; padding: 0.5rem;">
          <div v-if="list.items.value.length === 0" style="color: #999; text-align: center; padding: 2rem;">
            No cached items
          </div>
          <div
            v-for="item in list.items.value"
            :key="item.id"
            @click="selectItem(item.id)"
            style="margin-bottom: 0.5rem; padding: 0.5rem; background: #e8f5e9; border-radius: 4px; cursor: pointer; transition: background 0.2s;"
            :style="{ background: selectedItemId === item.id ? '#c8e6c9' : '#e8f5e9' }"
          >
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="margin-right: 0.3rem;">{{ getStatusIcon(item.status) }}</span>
                <b>{{ item.name }}</b>
              </div>
              <span :style="{ padding: '0.2rem 0.5rem', borderRadius: '3px', fontSize: '0.7rem', background: getStatusColor(item.status), color: 'white' }">
                {{ item.status }}
              </span>
            </div>
            <div style="font-size: 0.75rem; color: #666; margin-top: 0.2rem;">
              {{ new Date(item.created).toLocaleTimeString() }}
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Item Details -->
      <div style="border: 1px solid #ccc; padding: 1rem; border-radius: 4px;">
        <h2>Item Details</h2>

        <div v-if="!selectedItem" style="color: #999; text-align: center; padding: 2rem;">
          Select an item from the list
        </div>

        <div v-else>
          <div style="margin-bottom: 1rem;">
            <div style="margin-bottom: 0.5rem;">
              <b>Status:</b>
              <span v-if="selectedItem.isLoading.value">🔄 Loading...</span>
              <span v-else-if="selectedItem.item.value">✅ Ready</span>
              <span v-else>⏸️ Not loaded</span>
            </div>

            <div style="margin-bottom: 0.5rem;" v-if="selectedItem.timestamp.value">
              <b>Last refresh:</b> {{ new Date(selectedItem.timestamp.value).toLocaleTimeString() }}
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
              <button @click="selectedItem.refresh()" style="padding: 0.5rem 1rem;">
                Refresh Item
              </button>
            </div>
          </div>

          <div v-if="selectedItem.item.value" style="border: 1px solid #eee; padding: 1rem; border-radius: 4px; background: #f9f9f9;">
            <h3 style="margin-top: 0;">{{ selectedItem.item.value.name }}</h3>

            <div style="margin-bottom: 0.5rem;">
              <b>ID:</b> {{ selectedItem.item.value.id }}
            </div>

            <div style="margin-bottom: 0.5rem;">
              <b>Status:</b>
              <span :style="{ marginLeft: '0.5rem', padding: '0.2rem 0.5rem', borderRadius: '3px', fontSize: '0.8rem', background: getStatusColor(selectedItem.item.value.status), color: 'white' }">
                {{ selectedItem.item.value.status }}
              </span>
            </div>

            <div style="margin-bottom: 0.5rem;">
              <b>Created:</b> {{ new Date(selectedItem.item.value.created).toLocaleString() }}
            </div>

            <div v-if="'description' in selectedItem.item.value" style="margin-top: 1rem;">
              <b>Description:</b>
              <p style="margin: 0.5rem 0; color: #666;">{{ selectedItem.item.value.description }}</p>
            </div>

            <div v-if="'details' in selectedItem.item.value" style="margin-top: 1rem;">
              <b>Details:</b>
              <ul style="margin: 0.5rem 0; padding-left: 1.5rem;">
                <li v-for="(detail, i) in selectedItem.item.value.details" :key="i" style="color: #666;">
                  {{ detail }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Logs -->
      <div style="border: 1px solid #ccc; padding: 1rem; border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h2 style="margin: 0;">Activity Log</h2>
          <button @click="logs = []" style="padding: 0.3rem 0.8rem;">Clear Logs</button>
        </div>
        <div style=" overflow-y: auto; background: #f5f5f5; padding: 0.5rem; font-family: monospace; font-size: 0.85rem;">
          <div
            v-for="(log, i) in logs"
            :key="i"
            style="margin-bottom: 0.3rem;"
            :style="{ color: log.type === 'success' ? '#4caf50' : log.type === 'warning' ? '#ff9800' : '#666' }"
          >
            <span style="color: #999;">{{ log.time }}</span> {{ log.message }}
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
