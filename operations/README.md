# Agent operations

These local JSON commands expose agent-safe study preparation and review investigation. Run them from the experiment project's root.

```bash
bun run ops -- study-draft get
bun run ops -- study-draft update --json '{"reward":250,"total_available_places":20}'

bun run ops -- review inspect --study 0123456789abcdef01234567
bun run ops -- review inspect --study 0123456789abcdef01234567 --submission 89abcdef0123456789abcdef

bun run ops -- review-draft get --study 0123456789abcdef01234567
bun run ops -- review-draft update --study 0123456789abcdef01234567 \
  --json '{"actionOverrides":{"89abcdef0123456789abcdef":"return"}}'
```

Use `--file path/to/input.json` instead of `--json` for larger updates. Review actions are `approve`, `return`, `reject`, or `none`; a `null` value deletes an override. Bonus values are integer cents from 0 through 2,000; `null` deletes a bonus override.

`review inspect` reads the project token from `.prolific_token` and performs only Prolific GET requests. Pass `--fixture core/operations/fixtures/review-study.json` to use the bundled Prolific mock fixture instead.

The CLI intentionally has no command to create or publish a Prolific study, approve/return/reject submissions, or pay bonuses. Agents prepare RTDB-backed drafts; the researcher reviews them and uses the existing web-interface button for the final Prolific action.

Run `bun run test` for unit tests and `bun run typecheck` after edits. Tests use an in-memory Prolific reader and never contact Prolific.
