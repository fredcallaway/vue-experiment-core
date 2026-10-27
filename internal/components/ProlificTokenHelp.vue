<script setup lang="ts">
const dialog = ref<HTMLDialogElement>()
</script>

<template>
  <button type="button" class="text-sm text-blue-600 underline mt-2" @click="dialog?.showModal()">
    How do I get an API token?
  </button>
  <dialog
    ref="dialog"
    class="token-help bg-white shadow-xl"
    aria-labelledby="prolific-token-help-title"
    @keydown.esc.stop
  >
    <div class="flex justify-between items-start gap-4">
      <h2 id="prolific-token-help-title" class="text-xl font-semibold">Get a Prolific API token</h2>
      <button type="button" class="btn-gray-sm" autofocus @click="dialog?.close()">Close</button>
    </div>
    <ol class="list-decimal pl-6 my-4 flex flex-col gap-3">
      <li>
        Sign in to your
        <a href="https://app.prolific.com/" target="_blank" rel="noopener">Prolific researcher account</a>.
      </li>
      <li>Open <b>API Tokens</b> in the Prolific toolbar and choose <b>Create API Token</b>.</li>
      <li>Give the token a name, such as <b>Experiment Template</b>, then create it and copy its value.</li>
      <li>Close these instructions and paste the value into the <b>API token</b> field.</li>
    </ol>
    <p class="text-sm text-gray-600">
      See
      <a
        href="https://docs.prolific.com/documentation/get-started/api-fundamentals"
        target="_blank"
        rel="noopener"
      >Prolific's token instructions</a>
      for more detail.
    </p>
  </dialog>
</template>

<style scoped>
.token-help {
  margin: auto;
  width: min(36rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  overflow: auto;
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
}

.token-help::backdrop {
  background: rgb(0 0 0 / 50%);
}
</style>
