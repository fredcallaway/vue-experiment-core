<script setup lang="ts">
import { onClickOutside, useEventListener } from '@vueuse/core'
import { DebugSessionExistsError, useDebugSaving } from '../composables/useDebugSaving'
import { trueRandom } from '../../utils/trueRandom'

defineProps<{ preview?: boolean }>()
const { state, sessionId, error, start, stop } = useDebugSaving()
const root = useTemplateRef('root')
const dialog = useTemplateRef('dialog')
const input = useTemplateRef('input')
const indicator = useTemplateRef('indicator')
const menuOpen = ref(false)
const suffix = ref('')
const formError = ref('')
const inputId = useId()
const titleId = useId()

const label = computed(() => {
  if (state.value === 'saving') return 'Saving debug data…'
  if (state.value === 'error') return `Debug save failed for ${sessionId.value}. Click to retry. ${String(error.value)}`
  if (state.value === 'on') return `Saving debug data as ${sessionId.value}`
  return sessionId.value ? `Resume saving debug data as ${sessionId.value}` : 'Save debug data'
})

const closeMenu = () => { menuOpen.value = false }
onClickOutside(root, closeMenu)
useEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuOpen.value) {
    closeMenu()
    indicator.value?.focus()
  }
})

const showPrompt = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  suffix.value = Array.from({ length: 5 }, () => alphabet[Math.floor(trueRandom() * alphabet.length)]).join('')
  formError.value = ''
  dialog.value?.showModal()
  input.value?.select()
}

const activate = () => {
  if (state.value === 'saving') return
  if (state.value === 'on') menuOpen.value = !menuOpen.value
  else if (sessionId.value) start()
  else showPrompt()
}

const submit = async () => {
  dialog.value?.close()
  const failure = await start(`debug${suffix.value}`)
  if (failure instanceof DebugSessionExistsError) {
    formError.value = failure.message
    dialog.value?.showModal()
    input.value?.select()
  }
}

const stopSaving = () => {
  stop()
  closeMenu()
  indicator.value?.focus()
}
</script>

<template>
  <div ref="root" class="debug-saving relative flex" :class="{ preview }">
    <TutorialTarget
      as="span"
      title="Save debug data"
      help="Save this run to the debug database. Open the session or stop saving from the active indicator."
      placement="left"
    >
      <button
        ref="indicator"
        type="button"
        class="debug-save flex items-center gap-1.5"
        :class="state"
        :aria-label="label"
        :title="label"
        :aria-expanded="state === 'on' ? menuOpen : undefined"
        :aria-disabled="state === 'saving'"
        @click="activate"
      >
        <span
          class="text-xl"
          :class="{
            'i-mdi-cloud-upload-outline': state === 'off',
            'i-mdi-cloud-sync-outline': state === 'on',
            'i-mdi-cloud-alert-outline': state === 'error',
            'i-mdi-loading animate-spin': state === 'saving',
          }"
          aria-hidden="true"
        />
        <span v-if="state === 'saving'" class="text-xs">saving…</span>
        <span v-else-if="sessionId" class="text-xs font-mono">{{ sessionId }}</span>
      </button>
    </TutorialTarget>
    <div
      v-if="menuOpen"
      class="session-menu absolute right-0 top-full mt-2 p-1 bg-white text-black
        rounded shadow-lg border border-gray-200"
      role="group"
      aria-label="Debug session actions"
    >
      <a
        :href="`/data/sessions/${encodeURIComponent(sessionId!)}?mode=debug`"
        target="_blank"
        rel="noopener"
        class="menu-action block"
        @click="closeMenu"
      >Open session <span aria-hidden="true">↗</span></a>
      <button type="button" class="menu-action w-full text-left" @click="stopSaving">Stop saving</button>
    </div>
    <dialog ref="dialog" class="session-dialog bg-white text-black rounded-lg p-5 shadow-xl" :aria-labelledby="titleId">
      <form @submit.prevent="submit">
        <h2 :id="titleId" class="mb-4">Save debug data</h2>
        <label :for="inputId" class="block text-sm mb-1">Session ID</label>
        <div class="session-input flex items-center rounded border border-gray-300 font-mono">
          <span class="pl-3 text-gray-500 select-none">debug</span>
          <input
            :id="inputId"
            ref="input"
            v-model="suffix"
            aria-label="Session ID suffix"
            aria-description="The session ID starts with debug. Enter the remaining characters."
            class="min-w-0 w-40 py-2 pr-3 bg-transparent outline-none"
            pattern="[A-Za-z0-9_-]+"
            title="Use letters, numbers, underscores, or hyphens."
            required
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <p v-if="formError" role="alert" class="text-red-600 text-sm mt-2">{{ formError }}</p>
        <div class="flex justify-end items-center gap-4 mt-5">
          <button type="button" class="text-sm text-gray-500" @click="dialog?.close()">Cancel</button>
          <button type="submit" class="btn-blue text-sm">Save</button>
        </div>
      </form>
    </dialog>
  </div>
</template>

<style scoped>
.debug-save {
  opacity: 0.45;
  transition: opacity 150ms;
}

.debug-save:hover,
.debug-save:focus-visible {
  opacity: 0.75;
}

.debug-save.on,
.debug-save.error {
  opacity: 1;
}

.debug-save.on { color: #16a34a; }
.debug-save.error { color: #dc2626; }
.preview .debug-save.on { color: #4ade80; }
.preview .debug-save.error { color: #f87171; }

.debug-save:focus-visible {
  outline: 1px solid currentColor;
  outline-offset: 4px;
}

.session-menu { min-width: 10rem; }
.session-dialog { margin: auto; max-width: calc(100vw - 2rem); }
.menu-action { padding: 0.4rem 0.65rem; font-size: 0.8rem; white-space: nowrap; }
.menu-action:hover, .menu-action:focus-visible { background: #f3f4f6; }
.session-dialog::backdrop { background: rgb(0 0 0 / 25%); }
.session-input:focus-within { outline: 2px solid #3b82f6; outline-offset: 2px; }
</style>
