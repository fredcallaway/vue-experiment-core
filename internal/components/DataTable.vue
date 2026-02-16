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
  if (value === null || value === undefined) {
    return 'null'
  }
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

const route = useRoute()

const getCellLinkRoute = (column: string, row: Record<string, any>) => {
  const link = getCellLink(column, row)
  if (!link) return undefined

  if (typeof link === 'string') {
    const [path, queryString] = link.split('?')
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
  itemHeight: 35,
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

const estimateTextWidth = (text: string, scale:number = 1): number => {
  return text.length * 8 * scale
}

const TABLE_HEIGHT = 600
const TABLE_ROW_HEIGHT = 35
const MIN_COL_WIDTH = 80
const MAX_COL_WIDTH = 250
const CELL_HORIZONTAL_PADDING = 16

const getCellDisplayText = (
  column: string,
  row: { formatted: Record<string, string>, original: Record<string, any> }
): string => {
  const rawValue = row.original[column]

  if (rawValue === null || rawValue === undefined) {
    return ''
  }

  if (typeof rawValue === 'object') {
    if (R.isArray(rawValue)) {
      return rawValue.map(formatObjectValue).join(', ')
    }
    const entries = Object.entries(rawValue)
    if (entries.length === 0) {
      return formatObjectValue(rawValue)
    }
    return entries.map(([key, value]) => `${key}:${formatObjectValue(value)}`).join('  ')
  }

  return String(row.formatted[column] ?? '')
}

const columnWidths = computed(() => {
  if (!formattedTableData.value.length || !columns.value.length) return {}
  
  const widths: Record<string, number> = {}
  
  columns.value.forEach(col => {
    // Measure header width
    let measuredWidth = estimateTextWidth(col, 1.2)
    
    // Measure all cell values for this column
    formattedTableData.value.forEach(row => {
      const text = getCellDisplayText(col, row)
      const width = estimateTextWidth(text)
      if (width > measuredWidth) {
        measuredWidth = width
      }
    })
    
    widths[col] = Math.max(
      MIN_COL_WIDTH,
      Math.min(MAX_COL_WIDTH, measuredWidth + CELL_HORIZONTAL_PADDING)
    )
  })
  
  return widths
})

const tableWidth = computed(() => {
  return columns.value.reduce((total, col) => {
    return total + (columnWidths.value[col] ?? MIN_COL_WIDTH)
  }, 0)
})

const columnStyle = (column: string) => {
  const width = columnWidths.value[column] ?? MIN_COL_WIDTH
  return {
    width: `${width}px`,
    minWidth: `${width}px`,
    maxWidth: `${width}px`,
  }
}

const shouldShowOverflowViewer = (
  column: string,
  row: { formatted: Record<string, string>, original: Record<string, any> }
) => {
  const availableWidth = (columnWidths.value[column] ?? MIN_COL_WIDTH) - CELL_HORIZONTAL_PADDING
  const estimatedTextWidth = estimateTextWidth(getCellDisplayText(column, row))
  return estimatedTextWidth > availableWidth
}

const slots = useSlots()

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
      <div v-if="slots.default">
        <slot />
      </div>
      <div v-else>
        {{ filteredTableData.length }} rows
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
        class="overflow-auto subtle-scrollbar relative"
        v-bind="containerProps"
        :style="{
          height: `${TABLE_HEIGHT}px`,
          // don't start scrolling until full table is visible
          overflowY: containerIsVisible ? 'auto' : 'hidden',
          overflowX: 'auto',
        }"
      >
        <div class="sticky top-0 z-20">
          <table
            class="datatable-table text-sm"
            :style="{ tableLayout: 'fixed', width: `${tableWidth}px`, borderCollapse: 'separate', borderSpacing: '0' }"
          >
            <colgroup>
              <col
                v-for="col in columns"
                :key="col"
                :style="columnStyle(col)"
              >
            </colgroup>
            <thead>
              <tr>
                <th 
                  v-for="col in columns" 
                  :key="col"
                  px-2 py-2 text-left whitespace-nowrap bg-gray-200
                  :style="columnStyle(col)"
                >
                  {{ col }}
                </th>
              </tr>
            </thead>
          </table>
        </div>

        <div v-bind="wrapperProps" >
          <table
            class="datatable-table text-sm"
            border-white
            :style="{ tableLayout: 'fixed', width: `${tableWidth}px`, borderCollapse: 'separate', borderSpacing: '0' }"
          >
            <colgroup>
              <col
                v-for="col in columns"
                :key="col"
                :style="columnStyle(col)"
              >
            </colgroup>
            <tbody>
              <tr 
                v-for="{ data: row, index: idx } in virtualList" 
                :key="idx" 
                class="hover:bg-gray-100 transition-colors"
                :class="{
                  'animate-[fadeIn_0.5s_ease-out]': newRowIndices.has(idx)
                }"
                :style="{ height: `${TABLE_ROW_HEIGHT}px` }"
              >
                <td 
                  v-for="col in columns" 
                  :key="col"
                  px-2 py-2 whitespace-nowrap
                  :style="columnStyle(col)"
                >
                  <div class="flex items-center gap-1 min-w-0">
                  <template v-if="getCellLinkRoute(col, row.original)">
                    <a
                      v-if="'href' in (getCellLinkRoute(col, row.original) || {})"
                      :href="(getCellLinkRoute(col, row.original) as { href: string }).href"
                      :class="[
                        'datatable-cell-text',
                        shouldShowOverflowViewer(col, row) ? 'datatable-cell-text--clip' : 'datatable-cell-text--ellipsis',
                        'cursor-pointer',
                      ]"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {{ getCellDisplayText(col, row) }}
                    </a>
                    <NuxtLink
                      v-else
                      :to="getCellLinkRoute(col, row.original)"
                      :class="[
                        'datatable-cell-text',
                        shouldShowOverflowViewer(col, row) ? 'datatable-cell-text--clip' : 'datatable-cell-text--ellipsis',
                        'cursor-pointer',
                      ]"
                    >
                      {{ getCellDisplayText(col, row) }}
                    </NuxtLink>
                  </template>
                  <span
                    v-else
                    :class="[
                      'datatable-cell-text',
                      shouldShowOverflowViewer(col, row) ? 'datatable-cell-text--clip' : 'datatable-cell-text--ellipsis',
                    ]"
                  >
                    {{ getCellDisplayText(col, row) }}
                  </span>

                  <details
                    v-if="shouldShowOverflowViewer(col, row)"
                    class="overflow-viewer"
                  >
                    <summary class="overflow-toggle" title="Show full value">...</summary>
                    <div class="overflow-popover">{{ getCellDisplayText(col, row) }}</div>
                  </details>
                  </div>
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
.datatable-table th,
.datatable-table td {
  box-sizing: border-box;
}

.datatable-cell-text {
  display: block;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  white-space: nowrap;
}

.datatable-cell-text--ellipsis {
  text-overflow: ellipsis;
}

.datatable-cell-text--clip {
  text-overflow: clip;
}

.overflow-viewer {
  position: relative;
  display: inline-block;
  flex: 0 0 auto;
}

.overflow-toggle {
  list-style: none;
  cursor: pointer;
  color: #6b7280;
  font-weight: 700;
  line-height: 1;
}

.overflow-toggle::-webkit-details-marker {
  display: none;
}

.overflow-popover {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  min-width: 200px;
  max-width: 420px;
  max-height: 280px;
  overflow: auto;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.18);
  padding: 8px;
  white-space: normal;
  word-break: break-word;
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
