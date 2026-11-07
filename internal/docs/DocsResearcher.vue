<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
import DocsStudyData from './DocsStudyData.vue'
</script>

<template>
  <ESequence name="researcher">
    <DocsPage name="intro">
      <h2>Running a study</h2>
      <p>
        This guide covers the full lifecycle of an experiment, from study design to participant payments.
      </p>
      <ol>
        <li><b>Develop:</b> build the experiment and test the participant experience.</li>
        <li><b>Verify data:</b> record test sessions and check the data you will analyze.</li>
        <li><b>Post:</b> deploy the verified experiment and publish a Prolific study.</li>
        <li><b>Monitor:</b> follow recruitment and investigate incomplete sessions.</li>
        <li><b>Pay:</b> review submissions and pay participants, including bonuses.</li>
      </ol>
      <p>
        <em>
          Note: this guide assumes that you will use an AI agent to do most of the coding.
          If you want to do it the old-fashioned way, just replace "your agent" with "yourself"
          (and read the
          <NuxtLink to="/docs?jump=docs%5B2%5D-technical%5B0%5D-intro" external>technical docs</NuxtLink>).
        </em>
      </p>
    </DocsPage>

    <DocsPage name="develop">
      <h2>Developing your experiment</h2>
      <p>
        Start with the <b>paradigm</b>. What does a trial look like? Tell this to your agent and
        ask for a link to test it. If you know what variables you'll manipulate or vary,
        say so now. As long as your agent of choice reads <code>AGENTS.md</code> or
        <code>CLAUDE.md</code> (almost all do), it will know what to do.
      </p>
      <blockquote>
        <p>Implement a random dot motion task with variable coherence. Give feedback after each trial.</p>
      </blockquote>
      <p>
        Next comes <b>design</b>. Specify conditions, block structure, and incentives (bonuses).
        Watch your experiment's outline come to life and check that the different conditions
        do what you expect. Test specific sections by clicking on the outline (you can also
        pin sections so it stays there on reload).
      </p>
      <blockquote>
        <p>
          Each participant does four blocks of 30 trials. Coherence changes across blocks,
          either increasing or decreasing depending on condition. Give 5 points for each
          correct response (5 points = 1 cent).
        </p>
      </blockquote>

      <p>
        Now the <b>data</b>. Most likely, it's already being recorded and formatted
        nicely. But you should double-check the Data panel to the right as you go through
        the experiment (you might need to adjust the dropdown in the top right). It should
        look like a table/dataframe you'd want to analyze.
      </p>
      <blockquote>
        <p>Add block index to the data view. Make sure RT is relative to motion onset.</p>
      </blockquote>
      <p>
        Finally, the <b>instructions</b>. For complex tasks, this often needs a lot of human guidance.
        But an agent can get you started.
      </p>
      <blockquote>
        <p>
          Create interactive instructions including practice trials for different coherence
          levels. Explain the bonus scheme. Do NOT tell participants about how coherence
          changes across blocks. Minimize text.
        </p>
      </blockquote>
      <p>That's it! Now you're ready to post your first study.</p>
    </DocsPage>

    <DocsPage name="post">
      <h2>Posting to Prolific</h2>
      <p>
        The template's <NuxtLink to="/prolific">Prolific interface</NuxtLink> lets you post
        studies, monitor recruitment, and pay participants in one place. The first time you
        open it, follow the setup instructions to enter your Prolific API token and project ID.
      </p>
      <p>To post a study, follow these three steps:</p>
      <ol>
        <li>
          Choose <b>Create New Study</b>, set the dataset version, and enter the description, reward, estimated
          duration, number of places, and eligibility criteria. Check the hourly rate and
          total cost (this doesn't include bonuses!).
        </li>
        <li>
          Click <b>Deploy Website</b> to publish the verified experiment. The page checks that
          the published copy matches your current version, and will complain if it doesn't
          (agents know how to fix it).
        </li>
        <li>Click <b>Create &amp; Publish Study</b> when you are ready to recruit participants.</li>
      </ol>
      <p>
        FYI: The system records the git commit ID (or "SHA") whenever you deploy. This way
        you'll know exactly which version of the experiment (the exact code) each participant saw.
      </p>
    </DocsPage>

    <DocsPage name="monitor">
      <h2>Monitoring recruitment</h2>
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
        from the submission table and see the previous correspondence associated with the study.
      </p>
      <p>
        If approved submissions have incomplete data, the page will offer <b>replacement
        places</b> targeted at their condition assignments. Review that proposal when filling
        gaps in a balanced design.
      </p>
    </DocsPage>

    <DocsPage name="payment">
      <h2>Paying participants</h2>
      <p>
        After participants take part, use the study's review page to approve submissions for
        payment, request returns or reject submissions, and pay bonuses. The system brings each
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
        import a CSV when bonuses were calculated outside the app. The table always shows the
        <b>total</b> intended bonus; if you pay a bonus and then increase it later, only the
        remaining portion will be paid out in the second round.
      </p>
      <p>
        Check the decisions and pending payment total, then click <b>Execute</b> to apply
        the review actions and bonus payments to Prolific.
      </p>
    </DocsPage>

    <DocsStudyData />
  </ESequence>
</template>
