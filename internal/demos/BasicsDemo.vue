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

// Shared state for the ESequence example trial: the response page records the choice,
// the feedback page reads it. In a real experiment you'd log this instead (see the data demo).
const example = reactive<{ choice?: string }>({})

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
            If you're familiar with jsPsych, an epoch combines the idea of a "timeline" and a "plugin"
            into one composable unit. A single screen with its own behavior plays the role of a plugin,
            while an ordered collection of sub-epochs plays the role of a timeline. The difference is
            that the same component can do both, and the two compose without the timeline/plugin
            distinction baked in.
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
            (see the <NuxtLink to="/demo/devtools">devtools demo</NuxtLink>).
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
            <code>EPage</code> is where the participant actually does something, while
            <code>ESequence</code> and <code>ERepeat</code> are how you compose epochs into
            larger structures. The next sections cover each in detail.
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
          <pre b-1 b-gray-200 rounded p3 text-sm overflow-x-auto v-pre><code>&lt;EPage name="instructions"&gt;
  Press the button when you're ready.
  &lt;PContinue/&gt;
&lt;/EPage&gt;</code></pre>
          <p mt-3>
            By default <code>PContinue</code> advances when the participant presses space;
            pass <code>button</code> (e.g. <code>&lt;PContinue button="Next"/&gt;</code>) to show
            a button instead.
          </p>
          <p mt-3>
            <code>PContinue</code> is one of several <b>affordances</b> — small
            components that let the participant end the current epoch. See the
            <NuxtLink to="/demo/responses">responses demo</NuxtLink> for the full set.
          </p>
          <PContinue/>
        </EPage>

        <!-- `state` is a reactive scratch object scoped to this page, handy for tracking
             interaction without reaching for a logger. It's exposed as a slot prop. -->
        <EPage name="state" v-slot="{ state }">
          <h2>Page state</h2>
          <p>
            Each <code>EPage</code> hands its slot a reactive <code>state</code> object — a
            per-page scratchpad for whatever the participant does on the page. Here we just
            count clicks:
          </p>
          <pre b-1 b-gray-200 rounded p3 text-sm overflow-x-auto my-3 v-pre><code>&lt;EPage name="demo" v-slot="{ state }"&gt;
  &lt;button @click="state.clicks = (state.clicks ?? 0) + 1"&gt;Click&lt;/button&gt;
&lt;/EPage&gt;</code></pre>
          <div flex-center gap-3 my-3>
            <button b-1 b-gray-300 rounded px-3 py-1 @click="state.clicks = (state.clicks ?? 0) + 1">Click me</button>
            <span text-gray-600>clicks: {{ state.clicks ?? 0 }}</span>
          </div>
          <p text-sm text-gray-600>
            State lives only as long as the page's epoch. To keep data, log it instead
            (see the <NuxtLink to="/demo/data">data demo</NuxtLink>).
          </p>
          <PContinue/>
        </EPage>

        <!-- `done` (also a slot prop) finishes the page from script. Affordances like
             PContinue call it for you, but you can call it directly to end on any event. -->
        <EPage name="done" v-slot="{ done }">
          <h2>Finishing a page</h2>
          <p>
            A page finishes when its epoch is told it's <code>done</code>. Affordances like
            <code>PContinue</code> call <code>done()</code> for you, but the slot also exposes
            <code>done</code> directly, so you can end the page on any event:
          </p>
          <pre b-1 b-gray-200 rounded p3 text-sm overflow-x-auto my-3 v-pre><code>&lt;EPage name="demo" v-slot="{ done }"&gt;
  &lt;button @click="done"&gt;I'm finished&lt;/button&gt;
&lt;/EPage&gt;</code></pre>
          <div flex-center my-3>
            <button b-1 b-gray-300 rounded px-3 py-1 @click="done">I'm finished</button>
          </div>
          <p text-sm text-gray-600>
            Clicking the button advances the sequence, just like a <code>PContinue</code> would.
          </p>
        </EPage>
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

        <EPage name="example-intro">
          <p>
            Here is that <code>stimulus → response → feedback</code> trial as a running
            example. Each page is a separate epoch; when one finishes the sequence advances
            to the next.
          </p>
          <PContinue/>
        </EPage>

        <!-- The trial sketched above, made concrete. The three pages are separate epochs;
             `example` (a plain reactive object in the script) carries the response from the
             response page to the feedback page. -->
        <ESequence name="example" flex-center flex-col gap-5 min-h-50 b-1 b-gray-200 rounded p6>
          <EPage name="stimulus">
            <div text-sm text-gray-600>Stimulus</div>
            <p>What color is this word?</p>
            <div text-2xl font-bold text-red>red</div>
            <PContinue button="Respond"/>
          </EPage>

          <EPage name="response" v-slot="{ done }" flex-center flex-col gap-3>
            <div text-sm text-gray-600>Response</div>
            <p>Click the color the word was printed in.</p>
            <PButtons values="red blue" @click="(v) => { example.choice = v; done() }" />
          </EPage>

          <EPage name="feedback">
            <div text-sm text-gray-600>Feedback</div>
            <p v-if="example.choice === 'red'" text-green font-bold>Correct!</p>
            <p v-else text-red font-bold>Incorrect — the word was red.</p>
            <PContinue button="Finish trial"/>
          </EPage>
        </ESequence>
      </ESequence>

      <!-- ========================= NESTING ========================= -->

      <!-- Nesting gets its own section: a sequence's child can itself be a sequence,
           which is how small self-contained pieces compose into larger structures. -->
      <ESequence name="nesting">
        <EPage name="intro">
          <h2>Nesting</h2>
          <p>
            Because a sequence's child is just an epoch, a child can itself be an
            <code>ESequence</code>. The inner sequence must finish before the outer one
            advances. This is how a small, self-contained piece (like the trial above)
            becomes part of a larger structure — the active epoch below is
            <code>{{ currentEpoch.id }}</code>.
          </p>
          <pre b-1 b-gray-200 rounded p3 text-sm overflow-x-auto v-pre><code>&lt;ESequence name="block"&gt;
  &lt;ESequence name="trial"&gt;...&lt;/ESequence&gt;
  &lt;EPage name="break"&gt;...&lt;/EPage&gt;
&lt;/ESequence&gt;</code></pre>
          <PContinue/>
        </EPage>

        <ESequence name="example" flex-center flex-col gap-5 min-h-40 b-1 b-gray-200 rounded p6>
          <EPage name="step1">Step 1<PContinue/></EPage>
          <ESequence name="step2" flex-center flex-col gap-3>
            <EPage name="A">Step 2A (inner sequence)<PContinue/></EPage>
            <EPage name="B">Step 2B (inner sequence)<PContinue/></EPage>
          </ESequence>
          <EPage name="step3">Step 3<PContinue button="Continue"/></EPage>
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
          <p text-sm text-gray-600>
            <code>ERepeat</code> always runs iterations <code>0..count-1</code> in order, so to
            randomize trials you shuffle your data array before rendering (e.g. with
            <code>random.shuffle</code>) — the order lives in the data, not the loop.
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

          <!-- `trials[step]` — the iteration index selects this iteration's data. -->
          <EPage name="stimulus" flex-center flex-col gap-4>
            The word is
            <span font-bold :class="`text-${trials[step].color}`">{{ trials[step].word }}</span>.
            <PContinue/>
          </EPage>
        </ERepeat>

        <EPage name="outro">
          <h2>That's the core</h2>
          <p>
            With <code>EPage</code>, <code>ESequence</code>, and
            <code>ERepeat</code> you can express most of an experiment's structure.
            Everything else builds on the same epoch model.
          </p>
          <p>
            <b>What next?</b> The <NuxtLink to="/demo">demo index</NuxtLink> drills into
            specific features — writing your own leaf epoch
            (<NuxtLink to="/demo/custom-epoch">custom epoch</NuxtLink>), collecting input
            (<NuxtLink to="/demo/responses">responses</NuxtLink>), and the logging pipeline
            (<NuxtLink to="/demo/data">data</NuxtLink>) are good places to go from here.
          </p>
          <PContinue button="Restart from the top"/>
        </EPage>
      </ESequence>

    </ESequence>
  </div>
</template>
