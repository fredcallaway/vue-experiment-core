<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <ESequence name="data">
    <DocsPage name="view">
      <h3>Viewing your data</h3>
      <p>
        Open the <NuxtLink to="/data">Data Viewer</NuxtLink> to inspect your <b>live</b>
        participant data. Use the link at the top to switch to <b>debug</b> test data when needed.
      </p>
      <ul>
        <li>
          <b>Versions:</b> group sessions collected with the same experiment procedure.
          Open a version for completion counts, condition counts, timing, bonuses, errors,
          and tables combining its sessions. A pilot and a revised experiment should have different versions.
        </li>
        <li>
          <b>Sessions:</b> each session is one participant's attempt at your experiment.
          Open it for its status, timing, bonus, recorded events, and analysis tables. A
          replay link appears when session recording is configured.
        </li>
      </ul>
      <p>
        An <b>event</b> is a timestamped record of something that happened. A <b>data view</b>
        turns those records into an analysis table, such as one row per trial. Your experiment
        supplies its own views, which appear as named tabs alongside sessions and events.
      </p>
      <p>
        Use the table filters to find a session or inspect a subset of rows. Check the sync
        status and use the refresh control when you need the latest collected data.
      </p>
    </DocsPage>

    <DocsPage name="save">
      <h3>Saving data for analysis</h3>
      <p>
        Recording stores the session's events while the experiment runs. The Data Viewer's
        <b>save</b> button writes the current analysis tables to files on the computer running this app.
      </p>
      <ol>
        <li>Open <b>Versions</b> in the <NuxtLink to="/data">Data Viewer</NuxtLink> and choose your version.</li>
        <li>Inspect its sessions and the named data-view tabs to check the expected rows and columns.</li>
        <li>Click <b>save</b> beside the data path. It refreshes the sessions and writes the available views.</li>
        <li>Check the saved timestamp and open the folder shown on the page to use the files in your analysis.</li>
      </ol>
      <p>
        Analysis files are saved under <code>data/processed/live/&lt;version&gt;/</code>
        (or <code>debug</code> for test data). They include a session-summary CSV and the
        experiment's data views as CSV or JSON files. Table filters control what you see;
        saving exports the version's data, including rows hidden by a filter.
      </p>
      <p>
        The original session records are kept separately from these analysis files. A revised
        data view can produce new columns from previously recorded events; save again to
        update the files. It can only recover information the experiment actually recorded.
      </p>
    </DocsPage>
  </ESequence>
</template>
