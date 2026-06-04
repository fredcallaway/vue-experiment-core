<script lang="ts" setup>

// The "basics" tutorial. This is the entry point for learning the template, so it
// reads as high-level documentation: what an epoch is, how the epoch tree drives
// the experiment, and the two components you'll build almost everything from
// (ESequence and ERepeat). Other demos drill into specific features.
//
// The epoch tree lives in this component (not directly in the page) so that editing
// it triggers component-level HMR, which patches in place and preserves the running
// epoch state. A page edit instead tears the page down and rebuilds it, which resets
// currentEpoch to __TOP_EPOCH__ and breaks the outline. See internal/demos/manifest.ts.

const currentEpoch = useCurrentEpoch()

// In a real experiment, per-trial data lives in an array indexed by `step`. You
// typically build (and shuffle) this array yourself, then index it with `step`.
const trials = [
  { word: 'apple', color: 'red' },
  { word: 'sky', color: 'blue' },
  { word: 'leaf', color: 'green' },
]

</script>

<template>
  <div p4>
    <ESequence name="basics">

      <!-- ========================= WELCOME ========================= -->

      <EContinue name="welcome">
        <h2>Welcome!</h2>
        <p>
          If you're just starting with the template, you've come to the right
          place. This tutorial explains the core idea the whole framework is built
          on: the <b>epoch</b>.
        </p>
        <div card-info >
          <h3>Tip</h3>

          This tutorial <em>is</em> an epoch! Open its source code in your
          text editor to see how it works in more detail:
          <code>core/internal/demos/BasicsDemo.vue</code>
        </div>
      </EContinue>

      <!-- ========================= EPOCHS ========================= -->

      <ESequence name="epochs">

        <EContinue name="what">
          <h2>What is an epoch?</h2>
          <p>
            An <b>epoch</b> is a period of time in the experiment with a start and an end.
            A single trial, a block of trials, the instructions, the entire experiment — each is an epoch.
            Bigger epochs are built out of smaller ones, and can be flexibly composed both within
            and across experiments.
          </p>
          <p>
            If you're familiar with <b>jsPsych</b>, an epoch is most like a "timeline": it
            strings together sections of the experiment and can be hierarchically nested.
            But unlike a jsPsych timeline — which is a flat list of trials — epochs compose
            into a <em>tree</em>, so a self-contained block of trials can be dropped into a
            larger experiment unchanged. Individual trials, like jsPsych's plugins, are
            usually <b>components</b> you write (or reuse); epochs are how you arrange them.
          </p>
          <p>
            If you're familiar with computer science, the epoch system defines a <b>hierarchical state machine</b>
            where each epoch is a <em>state that can contain its own machine</em>. 
            You can also think of it like a <b>call stack</b> where each epoch is a <em>function</em>
            (more precisely, a function call).
          </p>
        </EContinue>

        <EContinue name="tree">
          <h2>The epoch tree</h2>
          <p>
            Because epochs can be hierarchically nested, your experiment forms a <b>tree</b>. Epochs that have
            children (e.g. <code>ESequence</code> and <code>ERepeat</code>) are <b>branches</b>.
            Epochs without children are <b>leaves</b>.
            At any moment, exactly one leaf is active — this is the <b>current epoch</b>.
            In most cases, it will define the main content that the participant is interacting
            with at the moment (the current trial). Persistent display elements, like a trial
            counter or running bonus, will be defined in higher-level branch epochs (the block).
          </p>
          <!-- <p>
            Every epoch has an <b>id</b> that identifies its place in the tree.
            An epoch's id is formed by attaching its name to its parent's id
            (with indices inserted in brackets for multistep epochs; discussed later).
            Because <code>ESequence</code> and <code>ERepeat</code> insert a step
            index, sibling epochs get distinct ids even when they share a name.
            The id of the current epoch is <code>{{ currentEpoch.id }}</code>.
          </p> -->
          <p>
            You can see the whole tree, and jump around it, in the outline to the right
            (see the <NuxtLink to="/demo/devtools">devtools demo</NuxtLink>).
          </p>
        </EContinue>

        <EContinue name="components">
          <h2>Epochs are components</h2>
          <p>
            You build an experiment by writing Vue <b>components</b> — reusable
            chunks of UI and logic defined in <code>.vue</code> files. Each epoch has an
            associated component, and you compose epochs the same way you nest HTML:
            by nesting tags in a <code>&lt;template&gt;</code>.
          </p>
          <div card-info>
            New to Vue? The
            <a href="https://vuejs.org/tutorial/" target="_blank" rel="noopener">official tutorial</a>
            is a good 20-minute introduction; you only need the basics.
          </div>
          <p mt-3>Here is about the smallest experiment you can write:</p>
          <DemoCode code='
            <ESequence name="experiment">
              <EContinue name="hello">Hello, world!</EContinue>
              <EContinue name="bye">Goodbye, world!</EContinue>
            </ESequence>
          '/>
          <p mt-3>
            It shows two screens in turn, each advancing on a press of space. The very
            page you're reading is built the same way: an <code>ESequence</code> of
            <code>EContinue</code>s.
          </p>
          <p>
            By convention, components that define epochs start with <code>E</code>.
            Components that start with <code>P</code> define actions the participant can take
            (see the <NuxtLink to="/demo/responses">responses demo</NuxtLink>).
          </p>
        </EContinue>

        <EContinue name="building">
          <h2>The building blocks</h2>
          <p>There are three core epochs that you'll use in almost every experiment.</p>
          <ul my-3 flex-col gap-2>
            <li><b><code>EContinue</code></b> shows a single screen and advances on a button or key press (e.g. an instructions page)</li>
            <li><b><code>ESequence</code></b> runs a sequence of epochs in order (e.g. the full experiment)</li>
            <li><b><code>ERepeat</code></b> runs one epoch many times (e.g. a block of trials).</li>
          </ul>
          <p>
            <code>EContinue</code> is the standard leaf for a "read this, then continue"
            screen, while <code>ESequence</code> and <code>ERepeat</code> compose epochs
            into larger structures. Anything more involved than continuing — a trial with
            real logic — is a custom component (covered below). The next sections take
            each in turn.
          </p>
        </EContinue>
      </ESequence>

      <!-- ========================= ECONTINUE ========================= -->

      <ESequence name="continue">
        <EContinue name="intro">
          <h2>EContinue</h2>
          <p>
            <code>EContinue</code> is the simplest leaf epoch: it shows one screen and
            finishes when the participant continues. Most instruction and text screens
            in an experiment are a single <code>EContinue</code>.
          </p>
          <DemoCode code='
            <EContinue name="instructions">
              Press the button when you&apos;re ready.
            </EContinue>
          '/>
          <p mt-3>
            By default <code>EContinue</code> advances when the participant presses space;
            pass <code>button</code> (e.g. <code>&lt;EContinue button="Next"&gt;…&lt;/EContinue&gt;</code>)
            to show a button instead, and <code>delay</code> to enforce a minimum reading time.
          </p>
        </EContinue>

        <EContinue name="component">
          <h2>When a screen does more</h2>
          <p>
            <code>EContinue</code> is for "show this, then move on". The moment a screen
            has real logic — internal phases, timing, or state shared across those phases
            (a trial, say) — write it as a <b>custom component</b> instead, with ordinary
            Vue-native state. That component is itself a leaf epoch.
          </p>
          <p>
            This is the single most important pattern in the template, and the one real
            experiments are built from: <code>EContinue</code> and the composers below
            give you the <em>structure</em>; custom components give you the <em>trials</em>.
            The <NuxtLink to="/demo/custom">custom-epoch demo</NuxtLink> walks through
            writing one, and the <NuxtLink to="/demo/experiment">full-experiment demo</NuxtLink>
            shows the two working together.
          </p>
          <div card-info>
            <h3>Under the hood</h3>
            <code>EContinue</code> is a thin wrapper over a lower-level epoch,
            <code>EPage</code>, plus a continue affordance. You rarely use
            <code>EPage</code> directly — reach for it only when you need a bare epoch
            wrapper with no built-in continue control (for instance, a page that advances
            itself after a fixed <code>duration</code>, or one whose slot drives
            <code>done()</code> from script).
          </div>
        </EContinue>
      </ESequence>

      <!-- ========================= ESEQUENCE ========================= -->

      <!-- ESequence is the workhorse for showing things one at a time. Each direct
           child is an epoch. The sequence shows its first child; when that child
           finishes, it advances to the next; when the last child finishes, the
           sequence itself finishes — handing control up to its own parent. The
           done()/render mechanics are intentionally kept in comments rather than
           prose; see also the "non-epoch children" note in the example below. -->
      <ESequence name="sequence">

        <EContinue name="intro">
          <h2>ESequence</h2>
          <p>
            An <code>ESequence</code> shows its children one at a time. It starts
            with the first child, starting the associated epoch. When that epoch ends
            (calls <code>done()</code>), the sequence moves on
            to the next child, and so on. When the last child finishes, the sequence itself
            finishes, handing control back to its parent (usually another <code>ESequence</code>).
          </p>
          <p mt-3>
            A whole experiment is one big <code>ESequence</code>: instructions, then a
            block of trials, then a survey. Each child is an epoch — an
            <code>EContinue</code> for a simple screen, a custom component for a trial,
            or another composer for a whole section:
          </p>
          <DemoCode code='
            <ESequence name="experiment">
              <EConsent>...</EConsent>
              <EContinue name="instructions">...</EContinue>
              <StroopTrial />          <!-- a custom trial component -->
              <ESurvey />
            </ESequence>
          '/>
          <p mt-3>
            Step through the live sequence below — three screens shown one at a time —
            and watch the active epoch in the outline.
          </p>
          <ESequence name="seq" flex-center flex-col gap-5 border-2 p2 my-3 h-40>
            <EContinue name="first" button="next">First screen</EContinue>
            <EContinue name="second" button="next">Second screen</EContinue>
            <EContinue name="third" button="done">Third screen</EContinue>
          </ESequence>
        </EContinue>

        <EContinue name=temporal>
          <h2>ESequence: temporal vs. spatial composition</h2>
          <p>
            ESequence works quite differently from normal Vue components.
            Typically, when a component accepts children (defines a slot), all of those children
            are rendered at once. That is, template composition is usually <em>spatial</em> not
            <em>temporal</em>. This is also how normal HTML works, e.g. <code>&lt;div&gt;</code>.
          </p>
          <p>
            We break from this standard pattern because temporal structure is so central in
            experiments (unlike many web pages). Other Vue libraries like use a similar pattern
            for <a href="https://vuetifyjs.com/en/components/steppers/#usage" target="_blank">multi-step forms</a>
            and <a href="https://magpie-experiments.org/00_getting_started/04_implementation_basics/#a-minimal-example" target="_blank">experiments</a>.
            However, unlike these simple "steppers", ESequence can be composed hierarchically.
          </p>
   
          <p>
            Importantly, you will also use normal spatial composition alongside the
            temporal composition provided by epochs. And you'll need to take some
            care to not mix the two types of composition. The rule is simple:
          </p>
          <ol>
            <li>Each direct child of an <code>ESequence</code> or <code>ERepeat</code> must be an <b>epoch</b> — a built-in like <code>EContinue</code>, or a custom component that declares one with <code>useEpoch</code>.</li>
            <li>An epoch component must have an epoch as its parent (usually <code>ESequence</code> or <code>ERepeat</code>).</li>
          </ol>
          <p>
            Built-in epochs are prefixed with <code>E</code> by convention; your own
            trial components don't have to be, but it's a useful habit. Either way,
            if you break the rule you'll get an informative error message.
          </p>
        </EContinue>

        <!-- Nesting: a sequence's child can itself be a sequence. Kept within the
             ESequence section since it's the same mechanism, just one level deeper. The
             code snippet sits alongside the live nested sequence it describes. -->
        <EPage name="nesting">
          <h3 font-bold>Nesting</h3>
          <p>
            Because a sequence's child is just an epoch, a child can itself be an
            <code>ESequence</code>. The inner sequence must finish before the outer one
            advances. This is how a small, self-contained section becomes part of a
            larger structure. Step through the live sequence below and watch the active
            epoch: <code>{{ currentEpoch.id }}</code>.
          </p>
          <div b-1 b-gray-200 rounded p3 my-3>
            <ESequence name="block" flex-center flex-col gap-5>
              <EContinue name="step1">Step 1</EContinue>
              <ESequence name="step2" flex-center flex-col gap-3>
                <EContinue name="A">Step 2A (inner sequence)</EContinue>
                <EContinue name="B">Step 2B (inner sequence)</EContinue>
              </ESequence>
              <EContinue name="step3" button="Continue">Step 3</EContinue>
            </ESequence>
          </div>
        </EPage>
      </ESequence>

      <!-- ========================= EREPEAT ========================= -->

      <!-- ERepeat runs the same child template `count` times in a row. The slot
           receives `step` (the 0-indexed iteration), so each iteration renders
           different content from one template. Each iteration is its own epoch
           instance, so they have independent state and are logged separately. -->
      <ESequence name="repeat">

        <EPage name="intro">
          <h2>ERepeat</h2>
          <p>
            Experiments are mostly repetition: the same trial, run many times with
            different stimuli. <code>ERepeat</code> captures that by running a single
            child epoch multiple times. Like ESequence, it moves to the next iteration
            when the child calls <code>done()</code>. We use the <code>step</code> slot
            variable (a counter starting at 0) to show different content on each iteration.
            In most cases (including the example below),
            step indexes a list of trials defined in the setup block.
          </p>

          <DemoCode layout="column" :code="`
            <ERepeat name=trials :count='trials.length' v-slot='{ step, nSteps }'>
              <div>Trial {{ step + 1 }} / {{ nSteps }}</div>
              <!-- a trial is usually its own component, fed this iteration's data -->
              <StroopTrial :word='trials[step].word' :color='trials[step].color' />
            </ERepeat>
          `">
            <ERepeat name=trials :count="trials.length" v-slot="{ step, nSteps }"
                     class="flex-col gap-4">
              <div text-sm text-gray-600>Trial {{ step + 1 }} / {{ nSteps }}</div>

              <!-- `trials[step]` — the iteration index selects this iteration's data.
                   Here the "trial" is just an EContinue; a real one would be a component. -->
              <EContinue name="stimulus" flex-center flex-col gap-4>
                The word is
                <span font-bold :class="`text-${trials[step].color}`">{{ trials[step].word }}</span>
              </EContinue>
            </ERepeat>
          </DemoCode>
        </EPage>
        <!-- Each iteration is a fresh epoch, so iterations have independent state
        and are logged separately. <code>ERepeat</code> advances when 
        iteration finishes and is itself done after the last one — exactly the
        <code>done</code>-propagation you saw with <code>ESequence</code>. -->
        <!-- <code>ERepeat</code> always runs iterations <code>0..count-1</code> in order.
        To randomize trials you shuffle your data array before rendering (e.g. with
        <code>random.shuffle</code>) — the order lives in the data, not the loop. -->
      </ESequence>

      <EPage name="outro">
        <h2>That's the core</h2>
        <p>
          With <code>EContinue</code>, <code>ESequence</code>, and
          <code>ERepeat</code> you can express most of an experiment's structure — and
          custom components fill in the trials. Everything else builds on the same epoch model.
        </p>
        <p>
          <b>What next?</b> The <NuxtLink to="/demo">demo index</NuxtLink> drills into
          specific features — writing your own trial component
          (<NuxtLink to="/demo/custom">custom epoch</NuxtLink>), assembling a whole study
          (<NuxtLink to="/demo/experiment">full experiment</NuxtLink>), collecting input
          (<NuxtLink to="/demo/responses">responses</NuxtLink>), and the logging pipeline
          (<NuxtLink to="/demo/data">data</NuxtLink>) are good places to go from here.
        </p>
      </EPage>
    </ESequence>
  </div>
</template>
