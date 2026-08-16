<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <ESequence name="data">
    <DocsPage name="intro">
      <h2>Recording data</h2>
      <p>
        Most experiment frameworks record data in one layer: each trial produces one object,
        shaped roughly the way you want it for analysis. That object is assembled by hand as
        the trial runs, so the recording code and the analysis format are the same thing.
      </p>
      <p>This template splits that into two layers:</p>
      <ol>
        <li>
          <b>Log densely.</b> During the experiment, record a stream of small, timestamped
          <b>events</b> — every onset, keypress, hover, and phase transition. Don't decide
          what matters yet; logging is cheap and you can't go back and collect it later.
        </li>
        <li>
          <b>Reduce afterwards.</b> A <b>data view</b> transforms that stream into the
          rectangular table you actually analyze — typically one row per trial.
        </li>
      </ol>
      <p>
        The reason for the split is that these two things change at different rates and for
        different reasons. The analysis format is a moving target: you will rewrite it after
        the pilot, after a reviewer asks for a new measure, after you notice a possible
        confound. The event stream isn't. If you logged densely, every one of those rewrites
        is a change to a pure function you can re-run over data you already collected. If you
        recorded one flat object per trial, it's a new data collection.
      </p>
      <div card-info>
        The rule of thumb: <b>log what happened, not what you plan to analyze.</b> If you find
        yourself computing something before logging it — accuracy, an RT difference, a running
        total — that computation probably belongs in a data view instead.
      </div>
      <p>
        The second layer is <b>component-local</b>. A trial component declares both the events
        it logs and the view that reduces them, right next to each other. The component that
        knows how to produce an event is the one that knows how to interpret it, so the
        knowledge stays in one file instead of drifting apart from a central analysis script.
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
        Every event carries a timestamp and the epoch it occurred in, so a lot of the
        structure you'd otherwise record by hand — which trial, which block, how long a phase
        lasted — is recoverable from the stream without you logging it explicitly.
      </p>
      <p>
        Log semantic task events explicitly. The input primitives log
        <code>participant.*</code> events automatically, but those are for inspection and
        debugging — they're easy to bypass with custom UI, so don't rely on them as your data
        record.
      </p>
      <p>
        Logged events are collected by the data writer and synced to a Firebase Realtime
        Database. Writes are batched and flushed in the background; a dropped connection won't
        lose data (queued writes are held in <code>localStorage</code> and retried). Just log
        events as they happen and trust that they'll arrive.
      </p>
    </DocsPage>

    <DocsPage name="views">
      <h3>Data views</h3>
      <p>
        A <b>data view</b> (<code>declareDataView</code>) is the second layer: a pure function
        from one session's events to export rows. A trial usually logs several events (an
        onset, a response, …), so the view groups them back together with
        <code>chunkBy</code>, keyed off the event that starts each trial:
      </p>
      <DemoCode code="
        declareDataView('trial', (session: SessionData) => {
          const events = session.events.filter(e => isOnset(e) || isChoice(e))
          // chunkBy starts a new group at each onset; each group becomes one row
          return chunkBy(events, isOnset).map(chunk => ({
            stimulus: chunk.find(isOnset)?.data.stimulus,
            correct: chunk.find(isChoice)?.data.correct ?? null,
          }))
        })
      "/>
      <p>
        Because the view is a pure function of stored events rather than something computed
        during the session, changing it is free: edit the transform and every session you've
        already collected re-exports in the new shape. Add a column mid-study and it applies
        retroactively.
      </p>
      <p>
        Declare data views next to the component that owns the logged event shape. The
        <NuxtLink to="/examples/trial">custom trial example</NuxtLink> shows the full pipeline
        in context, and the DataView panel in <NuxtLink to="/dev">/dev</NuxtLink> previews a
        declared view against the running session while you build it — the fastest way to
        check that your logging supports the table you want.
      </p>
      <p>
        The one real constraint is that the events are the permanent record. Renaming an event
        or changing its payload breaks views over data you already collected, so treat event
        schemas as more stable than the views that read them.
      </p>
    </DocsPage>
  </ESequence>
</template>
