<script lang="ts" setup>

const { done } = useEpoch('ENoReturn')

const confirm = () => {
  useCurrentSession().noReturnTime = Date.now()
  done()
}

</script>

<template>
  <div
    class="w-135 p-4 rounded-lg bg-yellow-200 text-yellow-600 [&>h3]:text-yellow-700 flex flex-wrap justify-center items-center text-center mx-auto text-lg"
  >
    <h3>Warning!</h3>

    Once you continue past this page, you cannot restart the study.
    <br/>
    If you refresh the page or close the browser window, you will not be able to complete the study!

    <PButton class="mx-auto btn-red bg-opacity-80 mt-5" value="I will not refresh the page" @click="confirm" />
  </div>
</template>