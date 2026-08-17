<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <ESequence name="composition">
    <DocsPage name="intro">
      <h2>Composing an experiment</h2>
      <p>Three core epochs express most of an experiment's structure:</p>
      <ul>
        <li><b><code>EContinue</code></b> shows a single screen and advances on a button or key press (e.g. an instructions page)</li>
        <li><b><code>ESequence</code></b> runs a sequence of epochs in order (e.g. the full experiment)</li>
        <li><b><code>ERepeat</code></b> runs one epoch many times (e.g. a block of trials)</li>
      </ul>
    </DocsPage>

    <DocsPage name="econtinue">
      <h3>EContinue</h3>
      <p>
        The standard leaf for a "read this, then continue" screen. By default it advances on
        space; pass <code>button</code> (boolean or a label) for a button, and
        <code>delay</code> for a minimum reading time.
      </p>
      <DemoCode code='
        <EContinue name="instructions" button="Next" delay="500">
          Press the button when you&apos;re ready.
        </EContinue>
      '/>
      <p>
        Under the hood, <code>EContinue</code> is a thin wrapper over the lower-level
        <code>EPage</code> plus a continue affordance. Reach for <code>EPage</code> directly
        only when you need a bare epoch with no continue control: a page that auto-advances
        after a fixed <code>:duration</code>, or one whose slot drives <code>done()</code>
        from script.
      </p>
    </DocsPage>

    <DocsPage name="esequence">
      <h3>ESequence</h3>
      <p>
        An <code>ESequence</code> shows its children one at a time. When the active child's
        epoch ends (calls <code>done()</code>), the sequence advances; when the last child
        finishes, the sequence itself finishes, handing control to <em>its</em> parent. A whole
        experiment is one big <code>ESequence</code>:
      </p>
      <DemoCode code='
        <ESequence name="experiment">
          <EConsent>...</EConsent>
          <EContinue name="instructions">...</EContinue>
          <StroopTrial />          <!-- a custom trial component -->
          <ESurvey />
        </ESequence>
      '/>
      <p>
        Because a child is just an epoch, a child can itself be an <code>ESequence</code> —
        the inner sequence must finish before the outer one advances. This is how a
        self-contained section becomes part of a larger structure
        (<NuxtLink to="/examples/study">live example</NuxtLink>).
      </p>
    </DocsPage>

    <DocsPage name="rules">
      <h3>Temporal vs. spatial composition</h3>
      <p>
        <code>ESequence</code> breaks from normal Vue composition: usually all of a
        component's children render at once (<em>spatial</em> composition, like a
        <code>&lt;div&gt;</code>); a sequence's children render one after another
        (<em>temporal</em>). You'll use both side by side, and they must not be mixed:
      </p>
      <ol>
        <li>
          Each direct child of an <code>ESequence</code> or <code>ERepeat</code> must be an
          <b>epoch</b> — a built-in like <code>EContinue</code>, or a custom component that
          declares one with <code>useEpoch</code>.
        </li>
        <li>
          An epoch component must have an epoch as its parent (usually
          <code>ESequence</code> or <code>ERepeat</code>).
        </li>
      </ol>
      <p>
        Breaking the rule produces an informative error. Plain presentational markup (a
        header, a progress bar) can sit <em>around</em> the epochs inside a branch — it stays
        mounted across every step.
      </p>
    </DocsPage>

    <DocsPage name="erepeat">
      <h3>ERepeat</h3>
      <p>
        Experiments are mostly repetition: the same trial, run many times with different
        stimuli. <code>ERepeat</code> runs a single child epoch <code>count</code> times; the
        slot receives <code>step</code> (0-indexed), which indexes a trial array you build
        (and shuffle) up front. Each iteration is a fresh epoch instance with independent
        state.
      </p>
      <DemoCode code="
        <ERepeat name=trials :count='trials.length' v-slot='{ step, nSteps }'>
          <div>Trial {{ step + 1 }} / {{ nSteps }}</div>
          <StroopTrial :word='trials[step].word' :ink='trials[step].ink' />
        </ERepeat>
      "/>
    </DocsPage>

    <DocsPage name="custom">
      <h3>Custom components</h3>
      <p>
        The moment a screen has real logic — internal phases, timing, state shared across
        those phases — write it as a <b>custom component</b>: a leaf epoch that declares
        itself with <code>useEpoch</code> (or <code>usePhaseEpoch</code>) and ends itself with
        <code>done()</code>. This is the single most important pattern in the template:
        <code>EContinue</code> and the composers give you the <em>structure</em>; custom
        components give you the <em>trials</em>. See the
        <NuxtLink to="/examples/trial">custom trial</NuxtLink> and
        <NuxtLink to="/examples/phases">phases</NuxtLink> examples.
      </p>
    </DocsPage>
  </ESequence>
</template>
