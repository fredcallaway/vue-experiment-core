<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
import DocsStudyData from './DocsStudyData.vue'
</script>

<template>
  <ESequence name="researcher">
    <DocsPage name="intro">
      <h2>Running a study</h2>
      <p>
        Once your experiment is ready, the study-management and data pages support the rest
        of your research workflow. You can use these pages without editing the experiment.
      </p>
      <ol>
        <li><b>Prepare:</b> check the published experiment and try the participant experience.</li>
        <li><b>Recruit:</b> create and publish a Prolific study, then monitor progress.</li>
        <li><b>Inspect:</b> view sessions and save tables for analysis.</li>
        <li><b>Review:</b> check submission decisions and bonuses, then apply them.</li>
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

    <DocsPage name="prepare">
      <h3>Before recruiting</h3>
      <p>
        Open <NuxtLink to="/prolific">Prolific</NuxtLink> to connect your account. The page
        prompts for a Prolific API token and walks you through choosing a workspace and project.
        The token lets this app manage studies on your behalf.
      </p>
      <p>
        Participants run a published copy of the experiment. Before creating a study, have
        the person maintaining your experiment publish the intended version. The create page
        checks that the local and published copies match and shows any mismatch to resolve.
      </p>
      <p>
        Use the <b>preview link</b> on the create page to walk through the published experiment
        with test participant details. Check the instructions, consent and contact details,
        task behavior, and completion screen before recruiting.
      </p>
      <p>
        Also check a test session's data: the expected responses and analysis columns should
        be present. The Data Viewer separates <b>live</b> participant data from <b>debug</b>
        test data; confirm which you are viewing.
      </p>
    </DocsPage>

    <DocsPage name="create">
      <h3>Posting to Prolific</h3>
      <p>
        Create a study from the <NuxtLink to="/prolific">Prolific pages</NuxtLink>. Enter
        the participant-facing description, reward, estimated completion time, number of
        places, and eligibility criteria.
      </p>
      <ul>
        <li><b>Wage check:</b> the form checks the hourly rate implied by your reward and duration.</li>
        <li><b>Cost preview:</b> review the estimated total, including Prolific's fee.</li>
        <li><b>Saved draft:</b> your form is saved as you type and is shared with collaborators.</li>
      </ul>
      <p>
        Creating the study leaves it <b>unpublished</b>. Review its details, then publish it
        when you are ready to recruit. Creating a draft and opening recruitment are separate actions.
      </p>
      <p>
        Completion codes are supplied automatically. They help distinguish normal completion
        from errors, early exits, timeouts, or a connection problem at the end of a session.
        You review these outcomes alongside the saved data.
      </p>
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

    <DocsStudyData />

    <DocsPage name="review">
      <h3>Reviewing submissions</h3>
      <p>
        The study's review page proposes actions using both the completion code and saved
        data. Normal completion with full data defaults to <b>approve</b>; a returned
        submission with incomplete data defaults to <b>no action</b>. Ambiguous cases are
        left <b>unspecified</b> for you to decide.
      </p>
      <p>
        Inspect the session when needed, then choose the appropriate action for each row.
        You can override any proposal. The summary counts show how many decisions remain
        unspecified.
      </p>
      <p>
        Your overrides are saved in this browser per study, so a reload preserves a review
        in progress. Check bonuses as well as submission actions before applying the review.
      </p>
      <p>
        <b>Execute</b> applies the pending review actions and bonus payments to Prolific.
        Proposed review decisions remain editable until you execute them.
      </p>
    </DocsPage>

    <DocsPage name="bonuses">
      <h3>Checking bonuses</h3>
      <p>
        If your experiment records bonuses, the review page reads those amounts from each
        session. It uses them for submissions being approved, already approved, or with full
        data; other submissions default to zero.
      </p>
      <p>
        Compare the proposed amounts with the participant data. You can adjust individual
        amounts by hand; adjusted amounts are marked so they are easy to spot. You can also
        import a CSV when bonuses were calculated outside the app.
      </p>
      <p>
        The page compares intended totals with bonuses already paid, so applying another
        review pays only the remaining difference. Check the pending payment total before
        clicking <b>Execute</b>.
      </p>
      <p>
        After review, return to the version in the <NuxtLink to="/data">Data Viewer</NuxtLink>
        to refresh and save the latest analysis tables.
      </p>
    </DocsPage>
  </ESequence>
</template>
