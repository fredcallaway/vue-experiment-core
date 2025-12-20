<script setup lang="ts">
import firebaseConfig from '~/firebase.config.json'

definePageMeta({
  layout: 'dashboard',
})

// dynamic routing to the appropriate tab; corrects typos

const route = useRoute()
const router = useRouter()

const mode = (route.query.mode as 'live' | 'debug') || 'live'
const otherMode = computed(() => mode === 'live' ? 'debug' : 'live')

const rawSlug = computed(() => {
  const slug = route.params.slug
  if (typeof slug === 'string') return []
  return slug
})
const normalizedSlug = computed(() => {
  const slug = rawSlug.value
  if (slug.length > 0) {
    const first = slug[0]
    if (first.startsWith('v')) {
      return ['versions', ...slug.slice(1)]
    }
    if (first.startsWith('s')) {
      return ['sessions', ...slug.slice(1)]
    }
    return ['versions']
  }
  return slug
})

watch(normalizedSlug, (newSlug) => {
  const current = rawSlug.value.join('/')
  const normalized = newSlug.join('/')
  if (normalized !== current) {
    router.replace({
      path: `/data/${normalized}`,
      query: route.query,
    })
  }
}, { immediate: true })

const defaultTab = computed(() => {
  if (normalizedSlug.value.includes('versions')) return 0
  if (normalizedSlug.value.includes('sessions')) return 1
  return 0
})

// load data and prepare tables
const { sessions, syncStatus, syncLocalData, lastUpdateTime } = useAllData(mode)

const versionList = computed(() => {
  if (!sessions.value) return []
    return R.pipe(
      R.values(sessions.value),
      R.groupBy(session => session.version),
      R.entries(),
      R.map(([version, sessions]) => ({
        version,
        ...makeVersionInfo(sessions),
      })),
      R.sortBy(R.prop('latestUpdateTime')),
    )
  }
)

const sessionList = computed(() => {
  if (!sessions.value) return []
  return makeSessionList(sessions.value)
})

onMounted(() => {
  syncLocalData()
})

</script>

<template>
  <div class="p-8 max-w-7xl mx-auto">
    <!-- <Error :error="metaError" /> -->

    <h1>Data Viewer</h1>

    <NuxtLink external :href="`/data?mode=${otherMode}`">view {{ otherMode }} data</NuxtLink>
    <br />
    <NuxtLink external :href="firebaseConfig.databaseURL">firebase console</NuxtLink>

    <div min-h-6 flex items-center>
      <span class="font-mono">data/{{ mode }}/raw/</span>&nbsp;
      <span v-if="syncStatus === 'synced'">is up to date</span>
      <span v-else>
        was last updated at 
        <RefreshButton
          :refresh="syncLocalData"
          :is-loading="syncStatus === 'loading'"
          :timestamp="lastUpdateTime"
          label=""
        />
      </span>
    </div>

    <TabContainer :default-tab="defaultTab">

      <Tab title="versions">
        <DataTable :data="versionList" placeholder="e.g. v1.*" >
          <h2>Versions ({{ versionList.length }})</h2>
        </DataTable>
      </Tab>

      <Tab title="sessions">
        <DataTable :data="sessionList" placeholder="e.g. active,complete 11/5" >
          <h2>Sessions ({{ sessionList.length }})</h2>
        </DataTable>
      </Tab>

    </TabContainer>
  </div>
</template>
