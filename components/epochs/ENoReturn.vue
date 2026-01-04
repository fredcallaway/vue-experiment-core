<script lang="ts" setup>

const { done } = useEpoch('ENoReturn')

const confirm = () => {
  useCurrentSession().noReturnTime = Date.now()
  done()
}

</script>

<template>
  <div w-130 mx-auto mt-30 flex-center gap-10>
    <div card-yellow >
      <h3>Warning!</h3>

      Once you continue past this page, you cannot restart the study.
      <br/>
      If you refresh the page or close the browser window, you will not be able to complete the study!

    </div>
    <PButton value="I will not refresh the page" @click="confirm" />
  </div>
</template>