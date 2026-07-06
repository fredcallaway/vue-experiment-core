# Epoch Repeat Structure

When an experiment has a simple repeated structure, put that structure in the experiment timeline instead of hiding it inside the trial component.

The mistake is to make a task component manage all repetition internally with counters, or to split the task into extra block/trial wrapper components just to model repetition. That makes the epoch outline less useful, spreads the example across too many files, and teaches future projects to add abstractions before they need them.

Prefer nested `ERepeat` blocks in `Experiment.vue` for regular designs like "12 problems, 5 trials per problem":

```vue
<ERepeat name="main" :count="problems.length" v-slot="{ step: problemIndex }">
  <ERepeat name="problem" :count="params.trialsPerProblem" v-slot="{ step: trial }">
    <ERiskyChoice
      :problem="problems[problemIndex]"
      :problem-index="problemIndex"
      :problem-count="problems.length"
      :trial="trial"
      :trials-per-problem="params.trialsPerProblem"
    />
  </ERepeat>
</ERepeat>
```

Then make `ERiskyChoice` the single trial epoch. It should own only the state and phases for one trial, for example `choice -> feedback`, and call `epoch.done()` when that trial is complete. The repeat epochs handle advancing to the next trial and problem.

This pattern keeps the visual timeline aligned with the experimental design:

- `main` is the sequence of problem blocks.
- `problem` is the sequence of repeated trials for one problem.
- `trial` is the participant-facing choice/feedback epoch.

Do not add a separate block component unless the block has real UI, state, or lifecycle behavior of its own. Do not use `useIndexableEpoch` inside the trial component just to recreate what `ERepeat` already provides. `ERepeat` already marks its children as identical for outline traversal, so it is the right primitive for ordinary repeated trials.

Keep task helpers, event loggers, and data views near the component that owns the event shape unless there is a genuine shared owner. A separate helper module is useful when multiple components need the same task model, but it is unnecessary if the only consumer is the single trial component plus a small `makeProblems()` export used by `Experiment.vue`.
