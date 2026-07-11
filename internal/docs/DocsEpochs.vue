<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <ESequence name="epochs">
    <DocsPage name="intro">
      <h2>Epochs</h2>
      <p>
        An <b>epoch</b> is a period of time in the experiment with a start and an end.
        A single trial, a block of trials, the instructions, the entire experiment — each is an
        epoch. Bigger epochs are built out of smaller ones, and can be flexibly composed both
        within and across experiments.
      </p>
      <p>
        If you're familiar with <b>jsPsych</b>, an epoch is most like a "timeline": it strings
        together sections of the experiment and can be hierarchically nested. But unlike a
        jsPsych timeline — a flat list of trials — epochs compose into a <em>tree</em>, so a
        self-contained block of trials can be dropped into a larger experiment unchanged.
        Individual trials, like jsPsych's plugins, are usually <b>components</b> you write (or
        reuse); epochs are how you arrange them.
      </p>
      <p>
        In computer-science terms, the epoch system is a <b>hierarchical state machine</b>
        where each epoch is a state that can contain its own machine — or a <b>call stack</b>
        where each epoch is a function call.
      </p>
    </DocsPage>

    <DocsPage name="tree">
      <h3>The epoch tree</h3>
      <p>
        Because epochs nest, your experiment forms a <b>tree</b>. Epochs with children
        (<code>ESequence</code>, <code>ERepeat</code>) are branches; epochs without children
        are leaves. At any moment exactly one leaf is active — the <b>current epoch</b> —
        usually the trial the participant is interacting with. Persistent display elements
        (a trial counter, a running bonus) live in higher branch epochs. You can see the whole
        tree, and jump around it, in the outline panel beside this page — the same panel
        shows your experiment's tree in <NuxtLink to="/dev">/dev</NuxtLink>.
      </p>
    </DocsPage>

    <DocsPage name="components">
      <h3>Epochs are components</h3>
      <p>
        Each epoch has an associated Vue component, and you compose epochs the same way you
        nest HTML: by nesting tags in a template. Here is about the smallest experiment you
        can write — two screens, each advancing on a press of space:
      </p>
      <DemoCode code='
        <ESequence name="experiment">
          <EContinue name="hello">Hello, world!</EContinue>
          <EContinue name="bye">Goodbye, world!</EContinue>
        </ESequence>
      '/>
      <p>
        By convention, components that define epochs start with <code>E</code>. Components
        that start with <code>P</code> collect participant input (see the
        <NuxtLink to="/examples/responses">responses example</NuxtLink>).
      </p>
    </DocsPage>
  </ESequence>
</template>
