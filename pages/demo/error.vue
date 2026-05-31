<template>
  <ESequence name="DemoError">
    <EContinue button name="PreError">
      The next page will throw an error.
    </EContinue>
    <EContinue name="brokenPage" button @mounted="throwError('Test error. Please ignore')" />
  </ESequence>
</template>
