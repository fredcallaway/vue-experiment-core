<script lang="ts" setup>

// The "source" tutorial. Demonstrates <DemoCode>, a helper for showing a code snippet
// alongside its live render. The snippet is passed as the `code` string prop and the live
// version goes in the default slot — an exact (but separate) duplicate, with no HTML escaping
// needed because `code` is a plain string. See internal/components/DemoCode.vue.

</script>

<template>
  <div p4>
    <ENavigableSequence v-slot="{ enableNext }" header="Source">

      <EPage @mounted="enableNext" name="intro" flex-col gap-3>
        <h2 text-xl font-bold>Code alongside render</h2>
        <p>
          When a tutorial shows a snippet, it helps to show the snippet running right next to
          it. <code>&lt;DemoCode&gt;</code> does that: you pass the snippet as the
          <code>code</code> string prop, and put the same markup in the default slot.
        </p>
        <p text-sm text-gray-600>
          The two copies are written separately, but the displayed code needs no
          <code>&amp;lt;</code> escaping and no <code>v-pre</code> — <code>code</code> is just a
          string, so it can hold literal tags verbatim.
        </p>
      </EPage>

      <EPage @mounted="enableNext" name="basic" flex-col gap-3>
        <div font-bold>A minimal example</div>
        <p text-sm text-gray-600>Code on the left, the live result on the right.</p>
        <DemoCode :code="`
          <PButtons values='red blue green' />
        `">
          <PButtons values="red blue green" />
        </DemoCode>
      </EPage>

      <EPage @mounted="enableNext" name="column" flex-col gap-3>
        <div font-bold>Stacked layout</div>
        <p text-sm text-gray-600>
          Pass <code>layout="column"</code> to stack the render under the code — better for
          wider snippets.
        </p>
        <DemoCode layout="column" code="<PContinue button='Next' />">
          <PContinue button="Next (does nothing here)" @click.prevent />
        </DemoCode>
      </EPage>

      <EPage @mounted="enableNext" name="displayOnly" flex-col gap-3>
        <div font-bold>Code-only</div>
        <p text-sm text-gray-600>
          With no slot, <code>&lt;DemoCode&gt;</code> is just a clean, auto-escaped code block —
          a drop-in for the hand-escaped <code>&lt;pre v-pre&gt;</code> blocks in the other demos.
        </p>
        <DemoCode code="
        <ESequence name='trial'>
          <EPage name='stimulus'>…</EPage>
          <EPage name='response'>…</EPage>
        </ESequence>
        "/>
      </EPage>

      <EPage name="ready">
        <div font-bold>That's it</div>
        <p>Use <code>&lt;DemoCode&gt;</code> wherever a demo shows a snippet it also renders.</p>
        <PContinue button="Finish" />
      </EPage>

    </ENavigableSequence>
  </div>
</template>
