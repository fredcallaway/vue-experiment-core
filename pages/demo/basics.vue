<script lang="ts" setup>

// The "basics" tutorial. This is the entry point for learning the template, so it
// reads as high-level documentation: what an epoch is, how the epoch tree drives
// the experiment, and the two components you'll build almost everything from
// (ESequence and ERepeat). Other demos drill into specific features.

const currentEpoch = useCurrentEpoch()

// In a real experiment, per-trial data lives in an array indexed by `step`. You
// typically build (and shuffle) this array yourself, then index it with `step`.
const trials = [
  { word: 'apple', color: 'red' },
  { word: 'sky', color: 'blue' },
  { word: 'leaf', color: 'green' },
]

defineWindowSize({
  width: 600,
  height: 800,
})

</script>

<template>
  <div p4>
    <ESequence name=basics>

      <!-- ========================= WELCOME ========================= -->

      <EPage name="welcome">
        <h2>Welcome!</h2>
        <p>
          If you're just starting with the template, you've come to the right
          place. This tutorial explains the core idea the whole framework is built
          on: the <b>epoch</b>.
        </p>
        <p>
          <!-- TODO: convert these to NuxtLink -->
          The other demos (see the <code>/demo</code> index) drill into specific
          features. Start here, then explore those once the basics click.
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
            Bigger epochs are built out of smaller ones, and be flexibly composed.
          </p>
          <p>
            If you're familiar with jsPsych, an epoch combines the idea of a "timeline" and a "plugin"
            into one composable unit. 
            <!-- TODO expand this -->
          </p>
          <p>
            For the CS nerds, the epoch system defines a hierarchical state machine where each
            epoch is a state (that can include its own machine). You can also think of it like
            the call stack in an executed program: epochs are like functions that can "call" 
            other epochs based on their own internal control flow.
            <!-- TODO check that this is technically correct; adjust as needed. -->
          </p>

          <p>
            That's the key idea: every part of the experiment, from the smallest
            screen to the whole study, is an epoch. Bigger epochs are built out of
            smaller ones, so the same handful of components compose all the way up.
          </p>
          <PContinue/>
        </EPage>

        <EPage name="tree">
          <h2>The epoch tree</h2>
          <p>
            Because epochs nest, your experiment forms a <b>tree</b>. Epochs that have
            children (e.g. `ESequence` and `ERepeat`, covered below) are <b>branches</b>.
            Epochs without children are <b>leaves</b>. 
            At any moment, exactly one leaf is active — this is the <b>current epoch</b>.
            In most cases, it will define the main content that the participant is interacting
            with at the moment (the current trial). Persistent display elements, like a trial
            counter or running bonus, will be defined in higher-level branch epochs (the block).
          </p>
          <p>
            <!-- TODO check if epoch ids are guaranteed to be unique.
             In practice they almost (?) always are unique because ESequence and ERepeat
             add indices. Perhaps a sophisticated user could break this somehow. Should
             we add a check for this in useEpoch? If so flag it as a possible followup. -->
            Every epoch has a unique <b>id</b> that identifies its place in the tree.
            An epoch's id is formed by attaching its name to its parent's id 
            (with indices inserted in brackets for sequential epochs; discussed later).
            The id of the current epoch is <code>{{ currentEpoch.id }}</code>.
          </p>
          <p>
            You can see the whole tree, and jump around it, in the outline to the right
            (see the <b>devtools</b> demo).
          </p>
          <PContinue/>
        </EPage>

        <EPage name="building">
          <h2>The building blocks</h2>
          <p>You'll meet three epoch components again and again:</p>
          <ul mt-3 flex-col gap-2>
            <li><code>EPage</code> shows a single screen (e.g. a trial, an instructions page)</li>
            <li><code>ESequence</code> runs a sequence of epochs in order (e.g. the full experiment)</li>
            <li><code>ERepeat</code> runs one epoch many times (e.g. a block of trials).</li>
          </ul>
          <p>
            <code>ESequence</code> and <code>ERepeat</code> are how you compose
            epochs into larger structures. The next two sections cover each in
            detail. (Specialized epochs — phases, navigable instructions, surveys —
            have their own demos.)
          </p>
          <PContinue/>
        </EPage>
      </ESequence>

      <!-- ========================= ESEQUENCE ========================= -->

      <!-- ESequence is the workhorse for showing things one at a time. Each direct
           child is an epoch. The sequence shows its first child; when that child
           finishes, it advances to the next; when the last child finishes, the
           sequence itself finishes — handing control up to its own parent. -->
      <ESequence name="sequence">

        <EPage name="intro">
          <h2>ESequence</h2>
          <p>
            An <code>ESequence</code> renders its children one at a time. It starts
            on the first child; each time the active child finishes, the sequence
            advances; once the last child finishes, the sequence finishes too.
          </p>
          <p>
            Each direct child is its own epoch — most often an <code>EPage</code>
            with a <code>PContinue</code>, which finishes when the participant
            continues. The example below is a sequence of four such steps.
          </p>
          <PContinue/>
        </EPage>

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
              <ESequence name="2" flex-center flex-col gap-3>
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
            returns to <i>its</i> parent.
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
          <p text-sm text-gray-600>
            One detail worth knowing: <code>ERepeat</code> always runs iterations
            <code>0..count-1</code> in order, so to randomize trials you shuffle
            your data array before rendering (e.g. with <code>random.shuffle</code>)
            — the order lives in the data, not the loop.
          </p>
          <PContinue button="Restart from the top"/>
        </EPage>
      </ESequence>

    </ESequence>
  </div>
</template>
