<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <DocsPage name="data">
    <h2>Viewing and saving your data</h2>
    <p>
      Open the <NuxtLink to="/data">Data</NuxtLink> page to inspect your participant data. Some terminology:
    </p>
    <ul>
      <li>
        <b>Sessions</b> are individual attempts at your experiment. Open one for its status,
        timing, bonus, recorded events, and analysis tables. A replay link appears when session recording is configured.
      </li>
      <li>
        <b>Versions</b> group sessions collected with the same experiment procedure. Open a
        version for quick summaries and exportable data tables.
      </li>
      <li>
        An <b>event</b> is a timestamped record of something that happened. The event log
        provides a fine-grained trace of exactly what each participant saw and did.
      </li>
      <li>
        A <b>data view</b> turns those records into an analysis table, perhaps one row per trial.
        Your experiment's views appear as named tabs alongside sessions and events.
      </li>
    </ul>
    <p>
      To <b>save the data for analysis</b>, open a version and inspect its data-view tabs, then click <b>save</b>
      beside the data path. This refreshes the session data and writes a session-summary CSV and the data
      views as CSV or JSON files to your computer. If you change the preprocessing after
      collecting the data, make sure to click save again to update the analysis files.
    </p>
    <p>
      Files are saved under <code>data/processed/&lt;mode&gt;/&lt;version&gt;/</code>. The mode is
      <code>live</code> or <code>debug</code>. Data collected through the prolific interface is saved under
      <code>live</code>. While testing your experiment, it's sometimes useful to record your own data.
      You can activate debug data saving by clicking the cloud icon in the top right when you're on the
      Develop or Preview pages. You can then view that data by clicking "view debug data" on the Data page.
    </p>
  </DocsPage>
</template>
