<script lang="ts" setup>
definePageMeta({
  layout: 'bare',
})
const prolific = useProlific()

const inputText = useLocalStorage('prolific_input_text', '')
const result = ref<any>('')

const { loading, error, wrap } = useAsyncRunner()

const sendRequest = wrap(async (method: string) => {
  result.value = 'loading...'
  result.value = await prolific.request(method, inputText.value)
})

onKeyStroke('Enter', () => {
  sendRequest('GET')
})


</script>

<template>
  <div class="p-8 max-w-7xl min-w-2xl mx-auto">
    <input type="text" v-model="inputText" w-180 mr-2/>
    <button v-for="method in ['GET', 'POST', 'PATCH']" ml-2
      :key="method" btn-blue-sm @click="sendRequest(method)"
    >
      {{method}}
    </button>
    <Error :error="error" />
    <div translate-y-2 h-0>
      <ClipboardCopyButton :text="JSON.stringify(result, null, 2)" v-show="result && !loading" />
    </div>
    <pre mt-2 bg-gray-100 p-2 pt6 w-full h-220 text-xs overflow-y-auto class="subtle-scrollbar">{{result  }}</pre>
  
  </div>
</template>