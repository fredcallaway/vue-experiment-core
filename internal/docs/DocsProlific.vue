<script lang="ts" setup>
import DocsPage from './DocsPage.vue'
</script>

<template>
  <ESequence name="prolific">
    <DocsPage name="intro">
      <h2>Running on Prolific</h2>
      <p>
        Prolific has a perfectly good web interface, and you could run a study entirely from
        it. The reason this template ships its own is that Prolific knows about
        <em>submissions</em> and your database knows about <em>data</em>, and every question
        you actually care about — did this person finish? should I approve them? what bonus do
        they get? — needs both sides at once.
      </p>
      <p>
        The <NuxtLink to="/prolific">/prolific</NuxtLink> pages join the two. Every submission
        is shown next to the session it produced, so approval and payment decisions are made
        against the data rather than against a completion code alone.
      </p>
      <div card-info>
        You'll need a Prolific API token; <NuxtLink to="/prolific">/prolific</NuxtLink> prompts
        for one and walks you through selecting a workspace and project the first time. The
        token is stored server-side, not in your repo.
      </div>
      <p>The lifecycle is four steps, each with its own page:</p>
      <ol>
        <li><b>Deploy</b> the current commit so participants get a fixed version.</li>
        <li><b>Create</b> a study describing pay, places, and eligibility.</li>
        <li><b>Monitor</b> it while it runs, adding places or pausing as needed.</li>
        <li><b>Review</b>: approve, return, reject, and pay bonuses.</li>
      </ol>
    </DocsPage>

    <DocsPage name="deploy">
      <h3>Deploying</h3>
      <p>
        Participants must all run the same code, and you must know which code that was. The
        create page therefore ties a study to a <b>git commit</b>: it reads your working
        tree's SHA, compares it to the SHA currently deployed, and refuses to create a study
        unless they match.
      </p>
      <p>
        A dirty worktree blocks deployment outright — if uncommitted changes could ship, the
        deployed SHA wouldn't identify what participants actually saw. Commit first, then
        deploy. (There are bypass checkboxes for the cases where you know better, e.g.
        re-publishing against an already-deployed build.)
      </p>
      <p>
        The study's <b>internal name</b> is generated as
        <code>{{ '{version}' }} (git {{ '{sha}' }})</code>, from <code>version</code> in
        <code>epoch.config.ts</code>. This is the only thing distinguishing your pilot from
        your real run in the Prolific study list, so bump <code>version</code> when the
        experiment meaningfully changes.
      </p>
    </DocsPage>

    <DocsPage name="create">
      <h3>Creating a study</h3>
      <p>
        The create page is a form over the Prolific study API, with a few guardrails added:
      </p>
      <ul>
        <li>
          <b>Wage check.</b> It computes an hourly rate from your reward and estimated
          completion time and blocks submission below the minimum. Getting this wrong is the
          most common way to have a study rejected.
        </li>
        <li>
          <b>Cost preview.</b> Total cost including Prolific's fee, before you commit to it.
        </li>
        <li>
          <b>Preview link.</b> Opens your deployed experiment with debug participant
          identifiers and <code>assignment=0</code>, so you can walk the real deployed build
          exactly as a participant would.
        </li>
      </ul>
      <p>
        The draft is saved to your database as you type, so the form survives a reload and is
        shared with collaborators. Studies are created unpublished; publishing is a separate,
        explicit action.
      </p>

      <h3>Completion codes</h3>
      <p>
        The template registers a code for each outcome — <code>COMPLETED</code>,
        <code>ERROR</code>, <code>ABORTED</code>, <code>TIMEOUT</code>,
        <code>DISCONNECTED</code> — and tells Prolific what to do with each: aborted and
        timed-out submissions are marked for return, the rest for manual review.
      </p>
      <p>
        Codes are a deterministic hash of the code type and your <code>version</code>, so they
        never need to be copied by hand and a code always identifies which build produced it.
        <code>ECompletion</code> picks the right one at the end of the session: normally
        <code>COMPLETED</code>, but <code>DISCONNECTED</code> if the data hasn't finished
        saving after 30 seconds — which is what lets you tell "didn't finish" apart from
        "finished but their connection dropped".
      </p>
    </DocsPage>

    <DocsPage name="monitor">
      <h3>Monitoring a running study</h3>
      <p>
        The study page auto-refreshes while you're looking at it (and backs off when the tab
        is idle) so it stays current without hammering the API. From here you can pause,
        resume, or stop recruitment, and <b>add places</b> to a study that's already running.
      </p>
      <p>
        Each submission row shows Prolific's status and completion code beside a
        <b>data status</b> derived from your database:
      </p>
      <ul>
        <li><b>full</b> — the session reached completion and the data is saved.</li>
        <li>
          <b>partial</b> — they passed the no-return point (the <code>ENoReturn</code> epoch,
          which warns participants that they can no longer restart) but never completed. These
          are the submissions that usually need a judgment call.
        </li>
        <li><b>minimal</b> — they left early, typically during instructions.</li>
        <li><b>missing</b> — no session at all; usually someone who opened the study and left.</li>
      </ul>
      <p>
        You can message participants directly from the table, and the correspondence is kept
        with the study, so a question about a payment doesn't have to be tracked down in a
        separate inbox.
      </p>

      <h3>Replacing incomplete assignments</h3>
      <p>
        Balanced condition assignment has a failure mode: if the participant assigned to cell
        7 quits halfway, you're short one participant in that cell, and simply recruiting one
        more gets you whatever comes next in the cycle — not necessarily cell 7.
      </p>
      <p>
        The study page detects this. It finds approved submissions whose data is incomplete,
        groups them by assignment, and offers to post replacement places <em>targeted at those
        specific assignments</em>. This is why the design stays balanced even though real
        participants drop out.
      </p>
    </DocsPage>

    <DocsPage name="review">
      <h3>Review and payment</h3>
      <p>
        Review is the part the custom interface saves the most time on. Each submission gets a
        proposed action, chosen from the completion code and the data status: a
        <code>COMPLETED</code> code with full data defaults to <b>approve</b>; a returned
        submission with incomplete data defaults to <b>no action</b>. Anything ambiguous is
        left <b>unspecified</b> for you to decide — the interface won't quietly approve
        something it isn't sure about.
      </p>
      <p>
        You can override any row, and overrides are kept in local storage per study, so a
        half-finished review survives a reload. The summary counts at the top tell you how
        much is still unspecified before you execute.
      </p>

      <h3>Bonuses</h3>
      <p>
        Bonuses come from the data. If your task uses <code>useBonus()</code>, the running
        total is written to session metadata as it accrues, and the review page reads it
        directly — no spreadsheet step. The computed bonus is only applied to submissions
        you're approving, or that already have full data or are already approved; otherwise it
        is treated as zero rather than paid on trust.
      </p>
      <p>
        Individual amounts can be adjusted by hand, and adjustments are flagged as such so you
        can see at a glance which payments deviate from what the task computed. A CSV import is
        available for bonuses calculated outside the app. The page tracks intended versus
        already-paid totals, so re-running a review doesn't double-pay.
      </p>
      <p>
        <b>Execute</b> applies every pending action and bonus payment in one confirmed batch,
        showing a summary first. This is the only step that writes to Prolific; everything
        before it is a draft you can revise.
      </p>
    </DocsPage>
  </ESequence>
</template>
