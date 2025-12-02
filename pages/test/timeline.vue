<script lang="ts" setup>

</script>

<template>
<div w300px mx-auto p4 mt-4 text-center relative>
  <ESequence name="experiment">
    <ESequence name="instructions">
      <EButtons values="A B">
        Instructions 1
      </EButtons>
      <EButtons values="C D">
        Instructions 2
      </EButtons>
    </ESequence>
    <ESequence name="main">
      <EButtons values="E F">
        Main 1
      </EButtons>
      <EButtons values="G H">
        Main 2
      </EButtons>
    </ESequence>
    <div>
      <h2>You're done!</h2>

      Good job!
    </div>
  </ESequence>
</div>
</template>