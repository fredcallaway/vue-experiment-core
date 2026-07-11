<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <DocsPage name="devtools">
    <h2>Devtools</h2>
    <p>
      The <NuxtLink to="/dev">/dev</NuxtLink> page runs your experiment inside the developer
      panel — the same one wrapped around these docs:
    </p>
    <ul>
      <li>
        <b>Controls</b> — arrows step to the previous/next leaf epoch; the pin marks the
        current epoch so a reload jumps back to it (handy when iterating on one trial); the
        lightning toggle is <b>fast mode</b>, which collapses delays so you can race
        through.
      </li>
      <li>
        <b>Outline</b> — a live tree of the epochs that have run so far. Click any leaf to
        jump straight to it. The outline is built as epochs mount, so an
        <code>ERepeat</code> whose iterations differ structurally fills in each iteration's
        shape only once it runs.
      </li>
      <li>
        <b>Events</b> — the live event log for the session; the first place to check that
        your task records what you expect.
      </li>
      <li>
        <b>DataView</b> — previews a declared data view against the running session's
        events, auto-selecting the view whose name matches the current epoch.
      </li>
      <li>
        <b>Conditions</b> — the condition inspector lists registered conditions and lets
        you pin one (written to <code>condition.&lt;key&gt;</code> URL params; the
        assignment counter cycles over un-pinned conditions only).
      </li>
    </ul>
    <p>
      Experiment content runs inside an <b>error boundary</b>: when an epoch throws, the
      error is logged and a fallback is shown instead of a blank screen, so one bug doesn't
      silently strand a participant.
    </p>
  </DocsPage>
</template>
