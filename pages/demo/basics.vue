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
    <ESequence>

      <!-- ========================= WELCOME ========================= -->

      <EPage name="welcome">
        <h2>Welcome!</h2>
        <p>
          If you're just starting with the template, you've come to the right
          place. This tutorial explains the core idea the whole framework is built
          on — the <b>epoch</b> — and introduces the two components you'll use to
          build almost any experiment.
        </p>
        <p mt-3>
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
            An <b>epoch</b> is one stretch of the experiment that eventually
            <i>finishes</i> and hands control to whatever comes next. A page of
            instructions, a single trial, a whole block of trials, the entire
            experiment — each is an epoch.
          </p>
          <p mt-3>
            That's the key idea: every part of the experiment, from the smallest
            screen to the whole study, is an epoch. Bigger epochs are built out of
            smaller ones, so the same handful of components compose all the way up.
          </p>
          <PContinue/>
        </EPage>

        <EPage name="tree">
          <h2>The epoch tree</h2>
          <p>
            Because epochs nest, your experiment forms a <b>tree</b>. At any moment
            exactly one leaf is active — that's what the participant sees. The path
            from the root to that leaf is the "current epoch".
          </p>
          <p mt-3>
            Right now the active epoch is
            <code>{{ currentEpoch.id }}</code>. An epoch's id is its name joined to
            its ancestors' names, so it doubles as its address in the tree. You can
            see the whole tree, and jump around it, from the outline in the
            <code>/dev</code> panel (see the <b>devtools</b> demo).
          </p>
          <PContinue/>
        </EPage>

        <EPage name="done">
          <h2>Finishing an epoch</h2>
          <p>
            An epoch runs until it calls <code>done()</code>. When a leaf finishes,
            control returns to its parent, which decides what happens next —
            usually advancing to the next child. When the parent runs out of
            children, <i>it</i> finishes, and so on up the tree until the whole
            experiment is done.
          </p>
          <p mt-3>
            You rarely call <code>done()</code> by hand. Components like
            <code>PContinue</code> call it for you when the participant continues —
            that's how a button press or spacebar advances the experiment.
          </p>
          <PContinue/>
        </EPage>

        <EPage name="components">
          <h2>The building blocks</h2>
          <p>You'll meet three epoch components again and again:</p>
          <ul mt-3 flex-col gap-2>
            <li><code>EPage</code> — a single screen; the most common leaf epoch.</li>
            <li><code>ESequence</code> — shows its children one after another.</li>
            <li><code>ERepeat</code> — runs one template many times (i.e. trials).</li>
          </ul>
          <p mt-3>
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
          <p mt-3>
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
          <p mt-3>
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
          <p mt-3 text-sm text-gray-600>
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
