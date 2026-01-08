<script lang="ts" setup>

const { done } = useEpoch('ENoReturn')

const confirm = () => {
  useCurrentSession().noReturnTime = Date.now()
  done()
}

</script>

<template>
  <div w-135 card-yellow flex-center text-center mx-auto text-lg>
    <h3>Warning!</h3>

    Once you continue past this page, you cannot restart the study.
    <br/>
    If you refresh the page or close the browser window, you will not be able to complete the study!

    <PButton value="I will not refresh the page" @click="confirm" mx-auto btn-red bg-opacity-80 mt-5 />
  </div>
</template>