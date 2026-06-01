<script lang="ts" setup>

defineWindowSize({
  width: 600,
  height: 800,
})

</script>

<template>
  <div p4>
    <ESequence>

      <EPage name="welcome">
        <h2>Welcome!</h2>
        If you're just starting to use the template, you've come to the right place.
        This tutorial will introduce the most important features.
        <PContinue/>
      </EPage>

      <ESequence name="epochs">
        <EPage>
          <h2>Epochs</h2>
          <!-- Describe the basic logic of epochs. -->
          <PContinue />
        </EPage>
        <!-- 
          Cover each of these
          ESequence
          EPage
        -->
      </ESequence>


    </ESequence>
  </div>
</template>
