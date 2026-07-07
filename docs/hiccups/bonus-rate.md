# Bonus Rate

The bonus conversion rate is `bonus.centsPerPoint` from `useBonus()`. Set it once in `Experiment.vue` and treat it as the single source of truth for payout math and participant-facing copy.

Do not introduce separate constants for payout fractions, percentages, or cents-per-reward in task components or composables. If instructions mention a rate (for example, "10% of the sampled reward"), derive the displayed value from `bonus.centsPerPoint` rather than hardcoding it.

Task code should update `bonus.points` only. It should not reassign `bonus.centsPerPoint`; that belongs at experiment setup.

```ts
// Experiment.vue
const bonus = useBonus()
bonus.centsPerPoint = 10
```

```vue
<!-- instructions or in-task reminders -->
A fixed proportion ({{ bonus.centsPerPoint }}%) of this value is paid as your bonus.
```

Dollar amounts shown to participants and written to session metadata come from `useBonus()` (`bonus.dollars`, `bonus.toDollars(...)`, etc.), which already applies `centsPerPoint`. Keep payout logic there instead of duplicating the conversion elsewhere.
