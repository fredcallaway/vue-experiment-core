<script setup lang="ts">

const props = defineProps<{
  data: Record<string, any>[]
  placeholder?: string
  getLink?: (column: string, value: any, row: Record<string, any>) => string | undefined
  formatValue?: (column: string, value: any, row: Record<string, any>) => string
}>()

const errors = computed(() => {
  return props.data.filter(row => row._isParseError === true) as ParseError[]
})

const tableData = computed(() => {
  return props.data.filter(row => row._isParseError !== true)
})

const columns = computed(() => {
  if (!tableData.value.length) return []
  return R.pipe(
    tableData.value,
    R.flatMap(obj => Object.keys(obj)),
    R.unique(),
    R.filter(col => col !== '_rowInfo')
  )
})

// formatting

const formatValue = (column: string, value: any, row: Record<string, any>) => {
  if (props.formatValue) {
    const fmt = props.formatValue(column, value, row)
    if (fmt) return fmt
  }
  // defaults
  const col = column.toLowerCase()
  const isNum = typeof value === 'number'
  if (value === null || value === undefined) return ''
  if (col.endsWith('time') || col.endsWith('timestamp') && isNum) {
    return formatDateTime(value)
  }
  if ((col.endsWith('bonus') || col.endsWith('cost')) && isNum) {
    return `$${value.toFixed(2)}`
  }
  return String(value)
}


const formatObjectValue = (value: any): string => {
  switch (typeof value) {
    case 'object':
      if (R.isArray(value)) {
        return '[' + value.map(formatObjectValue).join(', ') + ']'
      }
      return '{' + Object.entries(value).map(([key, value]) => `${key}:${formatObjectValue(value)}`).join(', ') + '}'
    case 'string':
      if (value === '') return "''"
      return value
    case 'number':0
      return Number.isInteger(value)
        ? value.toString()
        : parseFloat(value.toPrecision(3)).toString()
    default:
      return String(value)
  }
}

const formattedTableData = computed(() => {
  return tableData.value.map((row, idx) => {
    const formatted = Object.fromEntries(Object.entries(row).map(([col, value]) => {
      return [col, formatValue(col, value, row)]
    }))
    let searchText = ''
    Object.keys(row).forEach(col => {
      const fmt = formatted[col]
      if (col === '_rowInfo') return
      if (col.endsWith('time') || col.endsWith('timestamp')) {
        searchText += row[col] + ' '
      }
      if (fmt == '[object Object]') {
        Object.entries(row[col]).forEach(([key, value]) => {
          searchText += `${key}:${formatObjectValue(value)} `
        })
      } else {
        searchText += fmt + ' '
      }
    })
    
    return { formatted, original: row, searchText, idx}
  })
})

// filtering

const searchQuery = ref('')
const filter = computed(() => createTextFilter(searchQuery.value))

const filteredTableData = computed(() => {
  if (!formattedTableData.value?.length) return []
  if (!searchQuery.value.trim()) return formattedTableData.value
  
  return formattedTableData.value.filter(item => {
    return filter.value(item.searchText)
  })
})

const getCellLink = (column: string, row: Record<string, any>) => {
  const value = row[column]
  if (props.getLink) {
    const link = props.getLink(column, value, row)
    if (link) return link
  }
  switch (column) {
    case 'sessionId':
      return `/data/sessions/${row.sessionId}`
    case 'version':
      return `/data/versions/${value}`
    case 'studyId':
      if (value === 'UNKNOWN') return undefined
      return `/prolific/${value}`
    case 'epoch':
      return {
        path: '/playback',
        query: {
          session_id: row._rowInfo.sessionId,
          mode: row._rowInfo.mode,
          epoch: value
        },
        external: true
      }
    default:
      return undefined
  }
}

const getCellLinkRoute = (column: string, row: Record<string, any>) => {
  const link = getCellLink(column, row)
  if (!link) return undefined
  
  if (typeof link === 'string') {
    const [path, queryString] = link.split('?')
    const route = useRoute()
    const query: Record<string, string> = {}
    
    Object.entries(route.query).forEach(([key, val]) => {
      if (val !== null && val !== undefined) {
        query[key] = Array.isArray(val) ? String(val[0]) : String(val)
      }
    })
    
    if (queryString) {
      const params = new URLSearchParams(queryString)
      params.forEach((val, key) => {
        query[key] = val
      })
    }
    
    return { path, query }
  }
  
  if (link.external) {
    const route = useRoute()
    const query: Record<string, string> = {}
    
    Object.entries(route.query).forEach(([key, val]) => {
      if (val !== null && val !== undefined) {
        query[key] = Array.isArray(val) ? String(val[0]) : String(val)
      }
    })
    
    Object.entries(link.query || {}).forEach(([key, val]) => {
      query[key] = String(val)
    })
    
    const queryString = new URLSearchParams(query).toString()
    return {
      href: `${link.path}${queryString ? `?${queryString}` : ''}`,
      external: true
    }
  }
  
  return link
}

// only render items that are visible 
const { list: virtualList, containerProps, wrapperProps, scrollTo } = useVirtualList(filteredTableData, {
  itemHeight: 30,
  overscan: 20
})

// animation: auto-scroll and fade in new events

const previousRowCount = ref(0)
const newRowIndices = ref<Set<number>>(new Set())


watch(formattedTableData, (newRows, oldRows) => {
  const oldCount = oldRows?.length || 0
  const newCount = newRows.length
  
  console.debug('[DataTable] row count:', { oldCount, newCount })
  
  if (newCount > oldCount && oldCount > 0) {
    const indices = new Set<number>()
    for (let i = oldCount; i < newCount; i++) {
      const item = assertDefined(newRows[i], 'Row is undefined at index ' + i)
      if (item.idx > previousRowCount.value) {
        indices.add(item.idx)
      }
    }

    console.debug('[DataTable] New rows detected:', { indices: Array.from(indices), indicesSize: indices.size })
    
    if (indices.size > 0) {
      newRowIndices.value = indices
      setTimeout(() => {
        newRowIndices.value = new Set()
      }, 1000)
      
      const container = containerProps.ref.value
      if (container) {
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
        
        if (isAtBottom) {
          // container.scrollTop = container.scrollHeight
          nextTick(() => {
            scrollTo(1000000000)
          })
        }
      }
    }
  }
  previousRowCount.value = newCount
}, { immediate: true })

const containerIsVisible = useElementVisibility(containerProps.ref, {
  threshold: 1.0, // 100% visible
})

// Sync horizontal scroll between header and body
const headerWrapperRef = ref<HTMLDivElement>()

let scrollCleanup: (() => void) | null = null

const syncHorizontalScroll = () => {
  if (scrollCleanup) {
    scrollCleanup()
    scrollCleanup = null
  }
  
  const container = containerProps.ref.value
  const headerWrapper = headerWrapperRef.value
  if (!container || !headerWrapper) return
  
  const handleScroll = () => {
    headerWrapper.scrollLeft = container.scrollLeft
  }
  
  container.addEventListener('scroll', handleScroll)
  scrollCleanup = () => {
    container.removeEventListener('scroll', handleScroll)
  }
}

watch(containerIsVisible, (visible) => {
  if (visible) {
    nextTick(() => {
      syncHorizontalScroll()
    })
  }
})

onMounted(() => {
  nextTick(() => {
    syncHorizontalScroll()
  })
})

tryOnScopeDispose(() => {
  if (scrollCleanup) {
    scrollCleanup()
  }
})

const estimateTextWidth = (text: string, scale:number = 1): number => {
  return text.length * 6.5
}

const columnWidths = computed(() => {
  if (!formattedTableData.value.length || !columns.value.length) return {}
  
  const padding = 16 // px-2 on both sides = 8px * 2
  const minColWidth = 80
  const maxColWidth = Infinity
  
  const widths: Record<string, number> = {}
  
  columns.value.forEach(col => {
    // Measure header width
    let measuredWidth = estimateTextWidth(col, 1.2)
    
    // Measure all cell values for this column
    formattedTableData.value.forEach(row => {
      const value = row.formatted[col] ?? ''
      let text = String(value)
      if (text == '[object Object]') {
        text = Object.entries(row.original[col]).map(([key, value]) => `${key}:${value} `).join(' ')
      }
      const width = estimateTextWidth(text)
      if (width > measuredWidth) {
        measuredWidth = width
      }
    })
    
    // Add padding and apply min/max constraints
    widths[col] = Math.max(minColWidth, Math.min(maxColWidth, measuredWidth + padding))
  })
  
  return widths
})

</script>

<template>
  <div>
    <div v-if="errors.length" mb-4>
      <div text-xl font-bold text-red-600>{{ errors.length }} errors</div>
      <Pager :items="errors" >
        <template #default="{ item }">
          <Error
            :error="item.error"
            :info="item.info"
            no-header
          />
        </template>
      </Pager>
    </div>

    <div flex="~ row gap-2 justify-between items-end" mb-2 :class="{ 'opacity-0': columns.length == 0 }">
      <div>
        <slot />
      </div>
      <TextFilter v-model="searchQuery" :placeholder="placeholder" />
    </div>
    
    <div v-if="columns.length == 0" style="height: 640px;">
      <div flex-center>
        <div italic text-gray-400>just imagine all the data that might be here one day</div>
      </div>
    </div>
    <div v-else>
      <div 
        ref="headerWrapperRef" 
        class="overflow-x-auto header-scrollbar-hide" 
        style="scrollbar-width: none; -ms-overflow-style: none;"
      >
        <table class="text-sm" style="table-layout: fixed; width: 100%;">
          <thead>
            <tr class="bg-gray-200">
              <th 
                v-for="col in columns" 
                :key="col"
                px-2 py-2 text-left whitespace-nowrap
                :style="columnWidths[col] ? { width: `${columnWidths[col]}px` } : {}"
              >
                {{ col }}
              </th>
            </tr>
          </thead>
        </table>
      </div>
      <div 
        class="overflow-auto subtle-scrollbar"
        style="height: 600px;"
        v-bind="containerProps"
        :style="{
          // don't start scrolling until full table is visible
          overflow: containerIsVisible ? 'auto' : 'hidden',
        }"
      >
        <div v-bind="wrapperProps" >
          <table class="text-sm" border-white style="table-layout: fixed; width: 100%; border-collapse: separate; border-spacing: 0;">
            <tbody>
              <tr 
                v-for="{ data: row, index: idx } in virtualList" 
                :key="idx" 
                class="hover:bg-gray-100 transition-colors"
                :class="{
                  'animate-[fadeIn_0.5s_ease-out]': newRowIndices.has(idx)
                }"
                style="height: 35px;"
              >
                <td 
                  v-for="col in columns" 
                  :key="col"
                  px-2 py-2
                  style="white-space: nowrap; overflow: hidden;"
                  :style="columnWidths[col] ? { width: `${columnWidths[col]+2}px` } : {}"
                >
                  <template v-if="getCellLinkRoute(col, row.original)">
                    <a
                      v-if="'href' in (getCellLinkRoute(col, row.original) || {})"
                      :href="(getCellLinkRoute(col, row.original) as { href: string }).href"
                      class="cursor-pointer"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {{ row.formatted[col] }}
                    </a>
                    <NuxtLink
                      v-else
                      :to="getCellLinkRoute(col, row.original)"
                      class="cursor-pointer"
                    >
                      {{ row.formatted[col] }}
                    </NuxtLink>
                  </template>
                  <span v-else-if="typeof row.original[col] === 'object'">
                    <template v-if="Object.entries(row.original[col] || {}).length > 0">
                      <span
                        v-for="([key, value], idx) in Object.entries(row.original[col] || {})"
                        :key="key"
                        style="white-space: nowrap; display: inline-block;"
                      >
                        <span class="text-gray-400">{{ key }}</span>:
                        <span>{{ formatObjectValue(value)}}</span>
                        <span v-if="idx < Object.entries(row.original[col] || {}).length - 1">&nbsp;&nbsp;</span>
                      </span>
                    </template>
                  </span>
                  <span v-else>{{ row.formatted[col] }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header-scrollbar-hide::-webkit-scrollbar {
  display: none;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* not sure these are actually used */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
