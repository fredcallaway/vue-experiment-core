<script lang="ts" setup>

// ESequence is the workhorse for showing things one at a time. Each direct
// child is an *epoch* (EContinue, EPage, ESequence, ERepeat, ...). The sequence
// shows the first child; when that child finishes (calls `done`), it advances to
// the next; when the last child finishes, the sequence itself finishes.
//
// Sequences nest: a child of a sequence can be another sequence. This is how you
// build a whole experiment out of small, self-contained pieces.

</script>

<template>
  <div w150 mx-auto p10 flex-col gap-6>

    <div>
      <h2 text-xl font-bold>ESequence</h2>
      <p mt-2>
        Renders its children one at a time, advancing when each child finishes.
        Children are epochs; the sequence advances when the active child calls
        <code>done</code>, and finishes once its last child does.
      </p>
    </div>

    <!-- Each child below is a separate epoch. The simplest leaf is EContinue,
         which finishes when the participant clicks its button. -->
    <ESequence name="basics" flex-center flex-col gap-5 min-h-40 b-1 b-gray-200 rounded p6>
      <EContinue button="Next">
        <div font-bold>Step 1</div>
        This is the first child. Click the button to advance.
      </EContinue>

      <EContinue button="Next">
        <div font-bold>Step 2</div>
        The previous child finished, so the sequence moved on to this one.
      </EContinue>

      <!-- EPage is a leaf epoch whose slot decides when to finish. Here we
           expose `done` and call it from a button of our own. -->
      <EPage v-slot="{ done }">
        <div font-bold>Step 3</div>
        <div mb-3>A child can also control its own completion. This is an EPage.</div>
        <PButton value="Finish" @click="done" />
      </EPage>

      <!-- The last child: when it finishes the whole sequence is done. -->
      <EContinue button="Restart from the top">
        <div font-bold>Done</div>
        That was the last child, so the sequence has finished.
      </EContinue>
    </ESequence>

    <!-- Sequences nest. A child sequence runs to completion before its parent
         advances. Open /dev and watch the outline panel to see the tree. -->
    <div>
      <h3 font-bold>Nesting</h3>
      <p mt-1 mb-3 text-sm text-gray-600>
        A child of a sequence can itself be a sequence. The inner sequence must
        finish before the outer one advances.
      </p>
      <ESequence name="nested" flex-center flex-col gap-5 min-h-40 b-1 b-gray-200 rounded p6>
        <ESequence name="inner" flex-center flex-col gap-3>
          <EContinue button="Next">Inner step A</EContinue>
          <EContinue button="Next">Inner step B</EContinue>
        </ESequence>
        <EContinue button="Restart">Back in the outer sequence.</EContinue>
      </ESequence>
    </div>

  </div>
</template>
