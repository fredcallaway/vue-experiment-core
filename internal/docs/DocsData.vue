<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <ESequence name="data">
    <DocsPage name="intro">
      <h2>Recording data</h2>
      <p>
        Everything a participant does is recorded as a stream of <b>events</b>. Logged events
        are collected by the data writer and synced to a Firebase Realtime Database. Writes
        are batched and flushed in the background; a dropped connection won't lose data
        (queued writes are held in <code>localStorage</code> and retried). Just log events as
        they happen and trust that they'll arrive.
      </p>
    </DocsPage>

    <DocsPage name="events">
      <h3>Logging events</h3>
      <p>
        The lowest-level call is <code>logEvent(name, data)</code>. For the events that make
        up your data, prefer <code>declareEventLogger</code>: it fixes the event name and
        payload type, and returns a matching type guard for filtering the stream later.
      </p>
      <DemoCode code="
        const [logResponse, isResponse] =
          declareEventLogger<{ correct: boolean; rt: number }>('trial.response')

        logResponse({ correct: true, rt: 482 })  // typechecked
      "/>
      <p>
        Log semantic task events explicitly. The input primitives log
        <code>participant.*</code> events automatically, but those are for inspection and
        debugging — they're easy to bypass with custom UI, so don't rely on them as your data
        record.
      </p>
    </DocsPage>

    <DocsPage name="views">
      <h3>Data views</h3>
      <p>
        Events are the raw record; a <b>data view</b> (<code>declareDataView</code>)
        transforms a session's events into export rows — typically one row per trial. A trial
        usually logs several events (an onset, a response, …), so the view groups them back
        together with <code>chunkBy</code>, keyed off the event that starts each trial. See
        the <NuxtLink to="/examples/data">data example</NuxtLink> for the full pipeline, and
        watch it live in the Events and DataView panels in <NuxtLink to="/dev">/dev</NuxtLink>.
      </p>
      <p>
        Declare data views next to the component that owns the logged event shape, and when
        changing an event schema, consider compatibility with already-collected data.
      </p>
    </DocsPage>
  </ESequence>
</template>
