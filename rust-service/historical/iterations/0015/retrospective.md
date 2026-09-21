# Iteration 0015 Retrospective

## What We Expected

We expected five independent ownership groups to challenge all 47 inherited
iteration `0014` rows under the exact-owning-decision rule. A direct decision and
test mapping could validate a no-change result; each workstream could repair at
most two unrelated evidence clusters without changing shared semantics, APIs,
formats, dependencies, or workloads.

## What We Observed

The workstreams reconciled all inherited rows and added one new deferred
contract question. The final 48-row inventory contains 9 repairs, 33 adequate
dispositions, and 6 deferrals. Repairs were tests and documentation only;
integration added behavior-preserving compilation, synchronization, formatting,
and lint fixes. No runtime defect or shared semantic decision emerged.

Independent review found no blocker and corrected the inherited durable
crash-point evidence. General post-boundary evaluation found the quality
threshold met, but also identified contract traceability and diagnostic locality
as separate requirements not enforced by exact failure discrimination alone.
Because the repeat found material new gaps, convergence remains unproven.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- Concurrent delegated runs were repeatedly interrupted during cold compilation
	or returned output from sibling worktrees. Reports rejected exit 130, wrong
	branch, wrong package, and zero-selected-test results. Absolute checkout guards,
	isolated targets, warm guarded reruns, and selected-test counts produced
	attributable evidence. See the notable-event tables in the five
	[workstream reports](phase-2/) and the [integration report](phase-2/integration.md).
- Integration initially failed on the changed `RecvStream` API and test fixture
	synchronization in the same-connection server test. It repaired compilation,
	waited for response closure, and used an explicit create follow-up before the
	focused and full server suites passed.
- Strict integration Clippy rejected the long `sea-file` test and exposed
	pre-existing sequencer warnings. Extracting the file rejection matrix,
	mechanically simplifying the linted sequencer code, and adding one narrow
	`too_many_lines` allowance for the existing state machine preserved behavior.
	Rustfmt then normalized accepted touched code. All strict package and workspace
	gates passed afterward.
- Worktree-local frozen pnpm installation was needed for isolated generated and
	policy consumers. It changed neither lockfile. `./test.sh`, policy,
	`pnpm build:fast`, benchmark smoke, the counter executable, documentation, and
	final whitespace checks passed.
- Iteration `0014` `sea-core` and iteration `0015` `core-session` each appended a
	second untouched 64-line report template directly after a completed report.
	Cleanup commits removed both copies. The root cause is an unguarded repeated
	append; required-marker validation alone did not prevent recurrence. A generic
	one-top-level-heading validator now rejects this shape.

## Agentic Development Findings

The five-way ownership split was independent and integrated without source
conflicts. Neutral instructions, explicit two-cluster limits, and accepted
no-change outcomes kept changes proportionate. Reports supplied exact decisions,
tests, validation, and deferral triggers, which made inventory reconciliation
straightforward.

Checkout guards prevented contaminated command output from becoming evidence,
but shared execution channels still imposed substantial retry cost. Integration
review was necessary for strict workspace lint and for correcting the server
fixture. No person supplied issue-specific findings or made a mid-run semantic
decision. The approved next step and reusable refinement were supplied only at
the synthesis boundary.

The remaining method gap is explicit: implementation and passing tests do not
substitute for precise contract text, and shared conformance does not substitute
for practical owner-local diagnosis. The next instruction makes those two checks
independent.

## Practices to Keep, Change, or Stop

- **Keep:** neutral prompts, non-overlapping ownership, two-cluster budgets,
	accepted no-change outcomes, direct Git-object review, and complete integration
	gates. Owners: coordinator and workstream agents.
- **Change:** require quoted or linked contract text and separately require
	practical owner-local diagnostic evidence for every adequate disposition.
	Owners: quality skill, report templates, integration, and Phase 3 review.
- **Change:** validate every generated or completed record has exactly one
	top-level heading. Owner: coordination record validator.
- **Keep:** reject interrupted, foreign-worktree, or zero-selected-test output;
	use isolated targets and literal checkout guards. Owner: every reviewer.
- **Stop:** treating eventual shared-conformance failure as automatically local
	diagnosis or treating implementation behavior as an implicit promise.

## Durable Lessons

The existing exact-decision lesson in
[LEARNINGS.md](../../LEARNINGS.md#correctness-and-testing) was extended: adequate
evidence also requires precise contract text and practical owner-local diagnosis.
This generalizes across backends, decorators, transports, shared conformance,
and workloads.

The repeated template append is retained as a coordination lesson and enforced
by the record validator. It does not need a second learning-index entry because
the durable remedy belongs to the reusable record mechanism rather than product
architecture or testing practice.

## Open Questions

- Which of the 33 adequate rows still lack precise contract text or practical
	owner-local diagnostic evidence?
- Will one neutral two-cluster repeat find no material new deficiency and thereby
	establish convergence?
- When will the six deferred boundaries gain the required fault seam, consumer
	contract, architecture authority, or platform fixture?
- Can execution infrastructure provide stable isolated command channels without
	the retry cost observed in both iterations `0014` and `0015`?
