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
        <div card-info >
          <h3>Tip</h3>

          This tutorial <em>is</em> an epoch! Open its source code in your
          text editor to see how it works in more detail: 
          <code>core/internal/demos/BasicsDemo.vue</code>
        </div>
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
            If you're familiar with <b>jsPsych</b>, an epoch combines the idea of a "timeline" and a "plugin"
            into one composable unit. Like a timeline, epochs can string together different
            sections and be hierarchically nested. Like a plugin, epochs can take parameters,
            record data, and be defined with arbitrary HTML and javascript. The difference is
            that the same component can do both.
            An epoch is a <em>plugin that can have its own internal timeline.</em>
          </p>
          <p>
            If you're familiar with computer science, the epoch system defines a <b>hierarchical state machine</b>
            where each epoch is a <em>state that can contain its own machine</em>. 
            You can also think of it like a <b>call stack</b> where each epoch is a <em>function</em>
            (more precisely, a function call).
          </p>
          <PContinue/>
        </EPage>

        <EPage name="tree">
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
          <PContinue/>
        </EPage>

        <EPage name="components">
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
              <EPage name="hello">
                Hello, world!
                <PContinue/>
              </EPage>
            </ESequence>
          '/>
          <p mt-3>
            It renders a single screen with the text and a continue button. The
            very page you're reading is built the same way: an
            <code>ESequence</code> of <code>EPage</code>s.
          </p>
          <p>
            By convention, components that define epochs start with <code>E</code>.
            Components that start with <code>P</code> define actions the participant can take
            (see the <NuxtLink to="/demo/responses">responses demo</NuxtLink>).
          </p>
          <PContinue/>
        </EPage>

        <EPage name="building">
          <h2>The building blocks</h2>
          <p>There are three core epochs that you'll use in almost every experiment.</p>
          <ul my-3 flex-col gap-2>
            <li><b><code>EPage</code></b> shows a single screen (e.g. a trial, an instructions page)</li>
            <li><b><code>ESequence</code></b> runs a sequence of epochs in order (e.g. the full experiment)</li>
            <li><b><code>ERepeat</code></b> runs one epoch many times (e.g. a block of trials).</li>
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
          <DemoCode code='
            <EPage name="instructions">
              Press the button when you&apos;re ready.
              <PContinue/>
            </EPage>
          '/>
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
          <h2>EPage: Using internal state</h2>
          <p>
            Each <code>EPage</code> hands its slot a reactive <code>state</code> object — a
            per-page scratchpad for whatever the participant does on the page. Here we just
            count clicks:
          </p>
          <DemoCode my-3 layout="column" :code="`
            <EPage name='demo' v-slot='{ state }'>
              <button @click='state.clicks = (state.clicks ?? 0) + 1'>Click me</button>
              clicks: {{ state.clicks ?? 0 }}
            </EPage>
          `">
            <div flex-center gap-3>
              <button b-1 b-gray-300 rounded px-3 py-1 @click="state.clicks = (state.clicks ?? 0) + 1">Click me</button>
              <span text-gray-600>clicks: {{ state.clicks ?? 0 }}</span>
            </div>
          </DemoCode>
          <p text-gray-600>
            Note: EPage state lives only as long as the page's epoch. To keep data, log it instead
            (see the <NuxtLink to="/demo/data">data demo</NuxtLink>).
          </p>
          <div card-info>
            <h3>Tip</h3>
            You should only use EPage state for simple cases. For epochs
            with more complex state, you should define a 
            <NuxtLink to="/demo/custom">custom epoch</NuxtLink> instead.
          </div>
          <PContinue/>
        </EPage>

        <!-- `done` (also a slot prop) finishes the page from script. Affordances like
             PContinue call it for you, but you can call it directly to end on any event. -->
        <EPage name="done" v-slot="{ done }">
          <h2>EPage: Calling done</h2>
          <p>
            A page finishes when its epoch calls the <code>done()</code> function.
            <code>PContinue</code> call <code>done()</code> for you, but the slot also exposes
            <code>done</code> directly, so you can end the page on any event:
          </p>
          <DemoCode my-3 layout="column" :code="`
            <EPage name='demo' v-slot='{ done }'>
              <button @click='done'>I'm finished</button>
            </EPage>
          `">
            <div flex-center>
              <button b-1 b-gray-300 rounded px-3 py-1 @click="done">I'm finished</button>
            </div>
          </DemoCode>
          <p text-gray-600>
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

        <EPage name="intro" v-slot="{ state }">
          <h2>ESequence</h2>
          <p>
            An <code>ESequence</code> shows its children one at a time. It starts
            with the first child, starting the associated epoch. When that epoch ends
            (calls <code>done()</code>), the sequence moves on
            to the next child, and so on. When the last child finishes, the sequence itself
            finishes, handing control back to its parent (usually another <code>ESequence</code>).
          </p>
          <DemoCode code='
            <ESequence name="trial">
              <EPage name="ready">...</EPage>
              <EPage name="stimulus">...</EPage>
              <EPage name="response">...</EPage>
              <EPage name="feedback">...</EPage>
            </ESequence>
          '>
            <ESequence name="seq" flex-center flex-col gap-5 border-2 p2 h-60 >
              <EPage name="ready">
                <PContinue button=start />
              </EPage>

              <EPage name="stimulus" duration=1000>
                <div text-2xl font-bold text-red>red</div>
              </EPage>

              <EPage name="response" v-slot="{ done }" flex-center flex-col gap-3>
                <p>Click the color the word was printed in.</p>
                <PButtons
                  values="red blue"
                  classes="btn-red btn-blue"
                  @click="(v) => { state.choice = v; done() }"
                />
              </EPage>

              <EPage name="feedback">
                <p v-if="state.choice === 'red'" text-green text-xl font-bold>Correct!</p>
                <p v-else text-red font-bold>Incorrect — the word was red.</p>
                <PContinue button="Finish trial"/>
              </EPage>
            </ESequence>
          </DemoCode>
        </EPage>

        <EPage name=temporal>
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
            care to not mix the two types of composition.
            Fortunately, as long as you stick to our convention of prefixing epoch components
            with <code>E</code>, you can just follow two simple rules:
          </p>
          <ol>
            <li>Children of ESequence and ERepeat must start with E.</li>
            <li>Components that start with E must have an epoch as a parent (usually ESequence or ERepeat).</li>
          </ol>
          <p>
            But don't worry! If you forget to follow the rule, you'll get an informative error message.
          </p>
          <!--
            Technically, the child can be a div that renders an epoch; but this pattern should
            generally be avoided.
            TODO check that we actually throw an error message when trying to render two EPage at once.
          -->

        </EPage>

        <!-- Nesting: a sequence's child can itself be a sequence. Kept within the
             ESequence section since it's the same mechanism, just one level deeper. The
             code snippet sits alongside the live nested sequence it describes. -->
        <EPage name="nesting">
          <h3 font-bold>Nesting</h3>
          <p>
            Because a sequence's child is just an epoch, a child can itself be an
            <code>ESequence</code>. The inner sequence must finish before the outer one
            advances. This is how a small, self-contained piece (like the trial above)
            becomes part of a larger structure — the active epoch below is
            <code>{{ currentEpoch.id }}</code>.
          </p>
          <DemoCode layout="column" code='
            <ESequence name="block" flex-center flex-col gap-5>
              <EPage name="step1">Step 1<PContinue/></EPage>
              <ESequence name="step2" flex-center flex-col gap-3>
                <EPage name="A">Step 2A (inner sequence)<PContinue/></EPage>
                <EPage name="B">Step 2B (inner sequence)<PContinue/></EPage>
              </ESequence>
              <EPage name="step3">Step 3<PContinue button="Continue"/></EPage>
            </ESequence>
          '>
            <ESequence name="block" flex-center flex-col gap-5>
              <EPage name="step1">Step 1<PContinue/></EPage>
              <ESequence name="step2" flex-center flex-col gap-3>
                <EPage name="A">Step 2A (inner sequence)<PContinue/></EPage>
                <EPage name="B">Step 2B (inner sequence)<PContinue/></EPage>
              </ESequence>
              <EPage name="step3">Step 3<PContinue button="Continue"/></EPage>
            </ESequence>
          </DemoCode>
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
              <EPage name='stimulus'>
                The word is {{ trials[step].word }}.
                <PContinue/>
              </EPage>
            </ERepeat>
          `">
            <ERepeat name=trials :count="trials.length" v-slot="{ step, nSteps }"
                     class="flex-col gap-4">
              <div text-sm text-gray-600>Trial {{ step + 1 }} / {{ nSteps }}</div>

              <!-- `trials[step]` — the iteration index selects this iteration's data. -->
              <EPage name="stimulus" flex-center flex-col gap-4>
                The word is
                <span font-bold :class="`text-${trials[step].color}`">{{ trials[step].word }}</span>
                <PContinue/>
              </EPage>
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
      </EPage>
    </ESequence>
  </div>
</template>
