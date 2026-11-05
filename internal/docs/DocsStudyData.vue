<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <DocsPage name="data">
    <h2>Viewing and saving your data</h2>
    <p>
      Open the <NuxtLink to="/data">Data Viewer</NuxtLink> to inspect your <b>live</b>
      participant data. Use the link at the top to switch to <b>debug</b> test data when needed.
    </p>
    <ul>
      <li>
        <b>Versions</b> group sessions collected with the same experiment procedure. Open a
        version for completion counts, condition counts, timing, bonuses, errors, and combined analysis tables.
      </li>
      <li>
        <b>Sessions</b> are individual attempts at your experiment. Open one for its status,
        timing, bonus, recorded events, and analysis tables. A replay link appears when session recording is configured.
      </li>
    </ul>
    <p>
      An <b>event</b> is a timestamped record of something that happened. A <b>data view</b>
      turns those records into an analysis table, such as one row per trial. Your experiment's
      views appear as named tabs alongside sessions and events.
    </p>
    <h4 class="font-bold">Saving data for analysis</h4>
    <p>
      Open a version and inspect its data-view tabs, then click <b>save</b> beside the data
      path. This refreshes the session data and writes a session-summary CSV and the data
      views as CSV or JSON files to your computer.
    </p>
    <p>
      Files are saved under <code>data/processed/live/&lt;version&gt;/</code>
      (or <code>debug</code> for test data).
    </p>
    <p>
      The original session records are kept separately. If you revise the preprocessing,
      save again to regenerate analysis files from the data you have already collected.
    </p>
  </DocsPage>
</template>
