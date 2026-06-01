<script lang="ts" setup>

// ESequence is the workhorse for showing things one at a time. Each direct
// child is an *epoch* (EContinue, EPage, ESequence, ERepeat, ...). The sequence
// shows the first child; when that child finishes (calls `done`), it advances to
// the next; when the last child finishes, the sequence itself finishes.
//
// Sequences nest: a child of a sequence can be another sequence. This is how you
// build a whole experiment out of small, self-contained pieces.

const currentEpoch = useCurrentEpoch()

</script>

<template>
  <div p4 mx-auto flex-col gap-6>

    <div>
      <h2>ESequence</h2>
      <p mt-2>
        Renders its children one at a time, advancing when each child finishes.
        Children should be epochs; the sequence advances when the active child calls
        <code>done</code>, and finishes once its last child does.
      </p>
    </div>

    <!-- Each child below is a separate epoch. The simplest leaf is EContinue,
         which finishes when the participant clicks its button. -->
    <ESequence flex-center flex-col gap-5 min-h-40 b-1 b-gray-200 rounded p6>
      <EContinue>
        <div font-bold>Step 1</div>
        This is the first child. Click the button to advance.
      </EContinue>

      <EContinue>
        <div font-bold>Step 2</div>
        The previous child finished, so the sequence moved on to this one.
      </EContinue>

      <!-- Note that this child is *not* an epoch, but just a plain div. 
           This is fine because the div contains an epoch. Otherwise,
           a placeholder leaf epoch would start, and it would have no
           natural way to end.
           
           This pattern allows us to have some content that is stable while the
           inner "nested" ESequence steps through its children. -->
      <div>
        <h3 font-bold>Nesting</h3>
        <p mt-1 mb-3>
          A child of a sequence can itself be a sequence. The inner sequence must
          finish before the outer one advances. The current epoch is {{ currentEpoch.id }}.
        </p>
        <ESequence name=nested flex-center flex-col gap-5 min-h-40 b-1 b-gray-200 rounded p6>
          <EContinue name=1> Step 1 </EContinue>
          <ESequence name=2 flex-center flex-col gap-3>
            <EContinue name=A>Step 2A</EContinue>
            <EContinue name=B>Step 2B</EContinue>
          </ESequence>
          <EContinue name=3>Step 3</EContinue>
        </ESequence>
      </div>

      <!-- The last child: when it finishes the whole sequence is done. -->
      <EContinue button="Restart from the top">
        <div font-bold>Done</div>
        That was the last child, so the sequence has finished.
      </EContinue>
    </ESequence>
  </div>
</template>
