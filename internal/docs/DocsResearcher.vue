<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
import DocsStudyData from './DocsStudyData.vue'
</script>

<template>
  <ESequence name="researcher">
    <DocsPage name="intro">
      <h2>Running a study</h2>
      <p>
        You lead the development of your experiment, whether you write the code yourself or
        use a coding agent to implement it. This guide follows the whole process, from your
        study design to participant payments.
      </p>
      <ol>
        <li><b>Develop:</b> build the experiment and test the participant experience.</li>
        <li><b>Verify data:</b> record test sessions and check the data you will analyze.</li>
        <li><b>Post:</b> deploy the verified experiment and publish a Prolific study.</li>
        <li><b>Monitor:</b> follow recruitment and investigate incomplete sessions.</li>
        <li><b>Pay:</b> review submissions and pay participants, including bonuses.</li>
      </ol>
      <p>
        A <b>study</b> is a recruitment run on Prolific. A <b>session</b> is one participant's
        attempt at your experiment. A <b>version</b> groups sessions collected with the same
        experiment procedure; a pilot and a revised experiment should have different versions.
      </p>
      <p>
        The <NuxtLink to="/prolific">Prolific pages</NuxtLink> connect submissions with
        sessions, and the <NuxtLink to="/data">Data Viewer</NuxtLink> lets you explore the
        collected data by version or session.
      </p>
    </DocsPage>

    <DocsPage name="develop">
      <h3>Developing your experiment</h3>
      <p>
        Start with your study design: instructions, trial structure, stimuli, response and
        timing rules, conditions, and payments. Decide what the analysis tables should contain
        as part of that design, so recording and preprocessing are built with the task.
      </p>
      <p>
        If you use a <b>coding agent</b>, give it that specification and ask it to follow your
        project's <code>AGENTS.md</code>, read <code>core/docs/guide/README.md</code>, and build
        from the template's <NuxtLink to="/examples">working examples</NuxtLink>. Ask it to
        run type checks and browser tests and explain how it verified the requested behavior.
      </p>
      <p>
        Open <NuxtLink to="/dev">Develop</NuxtLink> to try each part as it is built. The
        outline lets you jump to a section; the Events and Data panels let you inspect what
        happens as you respond. Iterate with your agent until the behavior matches your design.
      </p>
      <p>
        Walk through the complete experiment as a participant, including instructions,
        consent and contact details, task timing, and completion. Before posting the study,
        verify the recorded data as described next.
      </p>
    </DocsPage>

    <DocsStudyData />

    <DocsPage name="post">
      <h3>Posting to Prolific</h3>
      <p>
        Open <NuxtLink to="/prolific">Prolific</NuxtLink> to connect your account. This app
        uses the <b>Prolific API</b> to manage studies on your behalf: enter an API token from
        your Prolific account and choose a workspace and project when prompted.
      </p>
      <ol>
        <li>
          Choose <b>Create New Study</b> and enter the description, reward, estimated
          duration, number of places, and eligibility criteria. Check the hourly rate and total cost.
        </li>
        <li>
          Commit the experiment's changes, or ask your agent to do so, then click <b>Deploy
          Website</b> to publish the verified experiment. The page checks that the published
          copy matches your current version.
        </li>
        <li>Click <b>Create &amp; Publish Study</b> when you are ready to recruit participants.</li>
      </ol>
    </DocsPage>

    <DocsPage name="monitor">
      <h3>Monitoring recruitment</h3>
      <p>
        Open a study to follow incoming submissions. The page refreshes while you are viewing
        it. You can pause, resume, or stop recruitment, and add more places to a running study.
      </p>
      <p>Each submission pairs Prolific's status and completion code with a <b>data status</b>:</p>
      <ul>
        <li><b>full</b> — the session reached completion and its data is saved.</li>
        <li><b>partial</b> — the participant passed the task's no-return point but did not complete.</li>
        <li><b>minimal</b> — the participant left early, often during instructions.</li>
        <li><b>missing</b> — no matching session was found.</li>
      </ul>
      <p>
        Open a session to investigate an unexpected result. You can also message a participant
        from the submission table and see the correspondence with the study.
      </p>
      <p>
        If approved submissions have incomplete data, the page can offer <b>replacement
        places</b> targeted at their condition assignments. Review that proposal when filling
        gaps in a balanced design.
      </p>
    </DocsPage>

    <DocsPage name="payment">
      <h3>Paying participants</h3>
      <p>
        After participants take part, use the study's review page to approve submissions for
        payment, request returns or reject submissions, and pay bonuses. It brings each
        Prolific submission together with its recorded data to suggest a decision and bonus amount.
      </p>
      <h4 class="font-bold">Default policy</h4>
      <ul>
        <li>Normal completion with full data defaults to <b>approve</b>.</li>
        <li>A returned submission with incomplete data defaults to <b>no action</b>.</li>
        <li>Ambiguous cases are left <b>unspecified</b> for you to decide.</li>
      </ul>
      <p>
        Inspect the session when needed, then choose the appropriate action for each row.
        You can override any proposal. The summary counts show how many decisions remain
        unspecified.
      </p>
      <h4 class="font-bold">Bonuses</h4>
      <p>
        If your experiment records bonuses, the review page reads those amounts from each
        session. It uses them for submissions being approved, already approved, or with full
        data; other submissions default to zero.
      </p>
      <p>
        You can adjust individual amounts by hand; adjusted amounts are marked. You can also
        import a CSV when bonuses were calculated outside the app. Bonuses already paid are
        subtracted from the intended totals, so another review pays only the remaining difference.
      </p>
      <p>
        Check the decisions and pending payment total, then click <b>Execute</b> to apply
        the review actions and bonus payments to Prolific.
      </p>
    </DocsPage>
  </ESequence>
</template>
