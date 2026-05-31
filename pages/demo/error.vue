<script lang="ts" setup>

// Experiments wrap their content in an error boundary (see MainContent's
// `capture-errors`). When any epoch throws, the boundary catches it, logs the
// error, and shows a fallback instead of a blank screen — so a bug in one trial
// doesn't silently strand the participant.
//
// `throwError` is the helper for raising an error from within an epoch. This page
// throws one on purpose so you can see what the boundary does. In real code you
// won't call throwError yourself; unexpected exceptions are caught the same way.

</script>

<template>
  <div w150 mx-auto p10 flex-col gap-6>

    <div>
      <h2 text-xl font-bold>Error handling</h2>
      <p mt-2>
        Epoch content runs inside an error boundary. When an epoch throws, the
        error is logged and a fallback is shown instead of a broken page. Click
        through below to trigger one on purpose with <code>throwError</code>.
      </p>
    </div>

    <ESequence name="DemoError" flex-center flex-col gap-4 min-h-30 b-1 b-gray-200 rounded p6>
      <EContinue button name="PreError">
        The next page will throw an error.
      </EContinue>
      <!-- Throwing on mount simulates a bug in a trial. The boundary catches it,
           logs it, and renders the fallback in place of this content. -->
      <EContinue name="brokenPage" button @mounted="throwError('Test error. Please ignore')" />
    </ESequence>
  </div>
</template>
