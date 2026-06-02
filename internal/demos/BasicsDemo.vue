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

      <EPage name="welcome">
        <h2>Welcome!</h2>
        <p>
          If you're just starting with the template, you've come to the right
          place. This tutorial explains the core idea the whole framework is built
          on: the <b>epoch</b>.
        </p>
        <p>
          The other demos (see the <NuxtLink to="/demo">demo index</NuxtLink>)
          drill into specific features. Start here, then explore those once the
          basics click.
        </p>
        <PContinue/>
      </EPage>

      <!-- ========================= EPOCHS ========================= -->

      <ESequence name="epochs">

        <EPage name="what">
          <h2>What is an epoch?</h2>
          <p>
            An <b>epoch</b> is a period of time in the experiment with a start and an end.
            A single trial, a block of trials, the instructions, the entire experiment — each is an epoch.
            Bigger epochs are built out of smaller ones, and can be flexibly composed both within
            and across experiments.
          </p>
          <p>
            <!-- TODO leaf and branch concepts not introduced yet. Either remove that 
             language or move this note to after tree. We could even make a full demo
             focused on jsPsych users and just point to that here.
              -->
            If you're familiar with jsPsych, an epoch combines the idea of a "timeline" and a "plugin"
            into one composable unit. A leaf epoch plays the role of a plugin (a single screen with its
            own behavior), while a branch epoch plays the role of a timeline (an ordered collection of
            sub-epochs). The difference is that the same component can do both, and the two compose
            without the timeline/plugin distinction baked in.
          </p>
          <p>
            For the CS nerds, the epoch system defines a hierarchical state machine where each
            epoch is a state that can contain its own machine. You can also think of it like
            the call stack in a running program: the active path from the root down to the current
            leaf is a stack of nested epochs, and a branch epoch "calls" its children based on its
            own internal control flow — when a child finishes, control returns to the parent, which
            decides what comes next.
          </p>
          <PContinue/>
        </EPage>

        <EPage name="tree">
          <h2>The epoch tree</h2>
          <p>
            Because epochs nest, your experiment forms a <b>tree</b>. Epochs that have
            children (e.g. <code>ESequence</code> and <code>ERepeat</code>) are <b>branches</b>.
            Epochs without children are <b>leaves</b>.
            At any moment, exactly one leaf is active — this is the <b>current epoch</b>.
            In most cases, it will define the main content that the participant is interacting
            with at the moment (the current trial). Persistent display elements, like a trial
            counter or running bonus, will be defined in higher-level branch epochs (the block).
          </p>
          <p>
            Every epoch has an <b>id</b> that identifies its place in the tree.
            An epoch's id is formed by attaching its name to its parent's id
            (with indices inserted in brackets for multistep epochs; discussed later).
            Because <code>ESequence</code> and <code>ERepeat</code> insert a step
            index, sibling epochs get distinct ids even when they share a name.
            The id of the current epoch is <code>{{ currentEpoch.id }}</code>.
          </p>
          <p>
            You can see the whole tree, and jump around it, in the outline to the right
            <!-- TODO link here and all other references to demos -->
            (see the <b>devtools</b> demo).
          </p>
          <PContinue/>
        </EPage>

        <EPage name="components">
          <h2>Epochs are components</h2>
          <p>
            You build an experiment by writing Vue <b>components</b> — reusable
            chunks of UI defined in <code>.vue</code> files. Each epoch has an
            associated component, and you compose epochs the same way you nest HTML:
            by nesting tags in a <code>&lt;template&gt;</code>. New to Vue? The
            <a href="https://vuejs.org/tutorial/" target="_blank" rel="noopener">official tutorial</a>
            is a good 20-minute introduction; you only need the basics.
          </p>
          <p>Here is about the smallest experiment you can write:</p>
          <pre b-1 b-gray-200 rounded p3 text-sm overflow-x-auto v-pre><code>&lt;ESequence name="experiment"&gt;
  &lt;EPage name="hello"&gt;
    Hello, world!
    &lt;PContinue/&gt;
  &lt;/EPage&gt;
&lt;/ESequence&gt;</code></pre>
          <p mt-3>
            It renders a single screen with the text and a continue button. The
            very page you're reading is built the same way — out of an
            <code>ESequence</code> of <code>EPage</code>s, which you'll meet next.
          </p>
          <PContinue/>
        </EPage>

        <EPage name="building">
          <h2>The building blocks</h2>
          <p>You'll meet three epoch components again and again:</p>
          <ul my-3 flex-col gap-2>
            <li><code>EPage</code> shows a single screen (e.g. a trial, an instructions page)</li>
            <li><code>ESequence</code> runs a sequence of epochs in order (e.g. the full experiment)</li>
            <li><code>ERepeat</code> runs one epoch many times (e.g. a block of trials).</li>
          </ul>
          <p>
            <!-- TODO mention EPage here -->
            <code>ESequence</code> and <code>ERepeat</code> are how you compose
            epochs into larger structures. The next two sections cover each in
            detail. 
          </p>
          <PContinue/>
        </EPage>
      </ESequence>

      <!-- ========================= EPAGE ========================= -->

      <ESequence name="page">
        <EPage name="intro">
          <h2>EPage</h2>
          <p>
            <code>EPage</code> is the simplest epoch: it shows one screen and
            finishes when the participant continues. For simple experiments,
            all the leaves of your tree will be <code>EPage</code>s — 
            instruction screens, individual trials, even sections of a trial.
          </p>
          <!-- TODO <PContinue button> for a button (default is press space)  -->
          <pre b-1 b-gray-200 rounded p3 text-sm overflow-x-auto v-pre><code>&lt;EPage name="instructions"&gt;
  Press the button when you're ready.
  &lt;PContinue/&gt;
&lt;/EPage&gt;</code></pre>
          <p mt-3>
            <!-- TODO: Make this very short and include a link to the relevant demo -->
            <code>PContinue</code> is one of several <b>affordances</b> — small
            components that let the participant end the current epoch. A page
            finishes when its epoch is told it's <code>done</code>, 
            <!-- NOTE this isn't correct in general -->
            <!-- which usually happens when an affordance like <code>PContinue</code> is activated. -->
          </p>
          <PContinue/>
        </EPage>
        <!-- TODO add two more pages showing use of done and state -->
      </ESequence>

      <!-- ========================= ESEQUENCE ========================= -->

      <!-- ESequence is the workhorse for showing things one at a time. Each direct
           child is an epoch. The sequence shows its first child; when that child
           finishes, it advances to the next; when the last child finishes, the
           sequence itself finishes — handing control up to its own parent. The
           done()/render mechanics are intentionally kept in comments rather than
           prose; see also the "non-epoch children" note in the example below. -->
      <ESequence name="sequence">

        <EPage name="intro">
          <h2>ESequence</h2>
          <p>
            An <code>ESequence</code> shows its children one at a time. It starts
            with the first child; when that child finishes, the sequence moves on
            to the next; and when the last child finishes, the sequence itself
            finishes, handing control back to its parent (usually another
            <code>ESequence</code>).
          </p>
          <pre b-1 b-gray-200 rounded p3 text-sm overflow-x-auto v-pre><code>&lt;ESequence name="trial"&gt;
  &lt;EPage name="stimulus"&gt;...&lt;/EPage&gt;
  &lt;EPage name="response"&gt;...&lt;/EPage&gt;
  &lt;EPage name="feedback"&gt;...&lt;/EPage&gt;
&lt;/ESequence&gt;</code></pre>
          <PContinue/>
        </EPage>

        <!-- TODO adjust structure of example
          - stimulus: "red"
          - response: two buttons, red and blue (PButtons)
          - feedack: correct/incorrect

          nested shouldn't be in example
        -->
        <!-- Each child below is a separate epoch. -->
        <ESequence name="example" flex-center flex-col gap-5 min-h-40 b-1 b-gray-200 rounded p6>
          <EPage name="step1">
            <div font-bold>Step 1</div>
            This is the first child. Continue to advance.
            <PContinue/>
          </EPage>

          <EPage name="step2">
            <div font-bold>Step 2</div>
            The previous child finished, so the sequence moved on to this one.
            <PContinue/>
          </EPage>

          <!-- Note that this child is *not* an epoch, but just a plain div.
               This is fine because the div contains an epoch. Otherwise,
               a placeholder leaf epoch would start, and it would have no
               natural way to end.

               This pattern lets us keep some content stable on screen while the
               inner "nested" ESequence steps through its own children. -->
          <div>
            <h3 font-bold>Nesting</h3>
            <p mt-1 mb-3>
              A child of a sequence can itself be a sequence. The inner sequence
              must finish before the outer one advances. This is how a small,
              self-contained piece becomes part of a larger structure — the active
              epoch is now {{ currentEpoch.id }}.
            </p>
            <ESequence name="nested" flex-center flex-col gap-5 min-h-40 b-1 b-gray-200 rounded p6>
              <EPage name="step1"> Step 1 <PContinue/></EPage>
              <ESequence name="step2" flex-center flex-col gap-3>
                <EPage name="A">Step 2A<PContinue/></EPage>
                <EPage name="B">Step 2B<PContinue/></EPage>
              </ESequence>
              <EPage name="step3">Step 3<PContinue/></EPage>
            </ESequence>
          </div>

          <!-- The last child: when it finishes the whole sequence is done. -->
          <EPage name="done">
            <div font-bold>Done</div>
            That was the last child, so the sequence has finished — and control
            returns to its parent.
            <PContinue button="Continue"/>
          </EPage>
        </ESequence>
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
            different stimuli. <code>ERepeat</code> captures that. It renders one
            template <code>count</code> times, passing the slot a
            <code>step</code> (0-indexed) so each iteration can show its own
            content.
          </p>
          <p>
            Each iteration is a fresh epoch, so iterations have independent state
            and are logged separately. <code>ERepeat</code> advances when an
            iteration finishes and is itself done after the last one — exactly the
            <code>done</code>-propagation you saw with <code>ESequence</code>.
          </p>
          <pre b-1 b-gray-200 rounded p3 text-sm overflow-x-auto v-pre><code>&lt;ERepeat name="trials" :count="trials.length" v-slot="{ step }"&gt;
  &lt;EPage name="trial"&gt;
    The word is {{ trials[step].word }}.
    &lt;PContinue/&gt;
  &lt;/EPage&gt;
&lt;/ERepeat&gt;</code></pre>
          <PContinue/>
        </EPage>

        <!-- The slot template is reused for every iteration; `step` selects this
             iteration's data. ERepeat advances when the child (an ESequence here)
             finishes, and finishes itself after the last iteration. -->
        <ERepeat name="trials" :count="trials.length" v-slot="{ step, nSteps }"
                 class="flex-col gap-4 min-h-50 b-1 b-gray-200 rounded p6">
          <div text-sm text-gray-600>Trial {{ step + 1 }} / {{ nSteps }}</div>

          <!-- A trial is usually a small sequence: stimulus, response, feedback.
               Note `trials[step]` — the iteration index selects the trial data. -->
          <!-- TODO simplify this; just show a sequence of words with bare PContinue (not button)  -->
          <ESequence name="trial" flex-center flex-col gap-4>
            <EPage name="stimulus">
              The word is
              <span font-bold :class="`text-${trials[step].color}`">{{ trials[step].word }}</span>.
              <PContinue button="Respond"/>
            </EPage>
            <EPage name="feedback">
              You saw trial {{ step + 1 }}. On to the next.
              <PContinue button="Next trial"/>
            </EPage>
          </ESequence>
        </ERepeat>

        <EPage name="outro">
          <h2>That's the core</h2>
          <p>
            With <code>EPage</code>, <code>ESequence</code>, and
            <code>ERepeat</code> you can express most of an experiment's structure.
            Everything else builds on the same epoch model.
          </p>
          <!-- TODO Consider whether this is critical. Perhaps it should be a comment. 
           If we keep it, it should be in the repeat section.
            -->
          <p text-sm text-gray-600>
            One detail worth knowing: <code>ERepeat</code> always runs iterations
            <code>0..count-1</code> in order, so to randomize trials you shuffle
            your data array before rendering (e.g. with <code>random.shuffle</code>)
            — the order lives in the data, not the loop.
          </p>
          <!-- TODO Add a "What next?" section or page with pointers to some other demos and the index -->
          <PContinue button="Restart from the top"/>
        </EPage>
      </ESequence>

    </ESequence>
  </div>
</template>
