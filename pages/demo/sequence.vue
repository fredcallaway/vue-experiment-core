<script lang="ts" setup>

// ESequence is the workhorse for showing things one at a time. Each direct
// child is an *epoch* (EPage, ESequence, ERepeat, ...). The sequence
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

    <!-- Each child below is a separate epoch. The simplest leaf is an EPage with
         a PContinue, which finishes when the participant continues. -->
    <ESequence flex-center flex-col gap-5 min-h-40 b-1 b-gray-200 rounded p6>
      <EPage>
        <div font-bold>Step 1</div>
        This is the first child. Continue to advance.
        <PContinue/>
      </EPage>

      <EPage>
        <div font-bold>Step 2</div>
        The previous child finished, so the sequence moved on to this one.
        <PContinue/>
      </EPage>

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
          <EPage name=step1> Step 1 <PContinue/></EPage>
          <ESequence name=2 flex-center flex-col gap-3>
            <EPage name=A>Step 2A<PContinue/></EPage>
            <EPage name=B>Step 2B<PContinue/></EPage>
          </ESequence>
          <EPage name=step3>Step 3<PContinue/></EPage>
        </ESequence>
      </div>

      <!-- The last child: when it finishes the whole sequence is done. -->
      <EPage>
        <div font-bold>Done</div>
        That was the last child, so the sequence has finished.
        <PContinue button="Restart from the top"/>
      </EPage>
    </ESequence>
  </div>
</template>
