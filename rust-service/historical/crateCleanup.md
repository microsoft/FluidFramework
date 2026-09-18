# Crate Cleanup Iteration

Run one parallel workstream per crate. The goal is a broad, scattershot pass for
low-risk, low-effort quality improvements, not exhaustive cleanup or redesign.
It is valid for a workstream to find little or nothing worth changing.

Each workstream owns only its crate's source, tests, `README.md`, `DEV.md`, and
iteration report. Do not change another crate, a cross-crate API, a dependency,
a wire or persistence format, a workspace manifest, or a lockfile. Record
larger, cross-cutting, uncertain, or potentially breaking opportunities as
follow-up work instead of implementing them.

Prefer small, independently reviewable commits. Stop and report the issue when
a change requires architectural judgment or broader ownership.

## Improve documentation

Correct documentation that is stale, unclear, incomplete, or difficult to
navigate. Do not add comments merely to repeat an identifier or satisfy an item count.

When possible, use the conventional syntax for doc comments (`//!` and `///`)
instead of `#[doc = "..."]` or `#![doc = "..."]`.

Module and type documentation should start with a concise, unambiguous sentence
explaining what the item is. Function and method documentation should generally
start by saying what the item does. Use later paragraphs for important
additional details when needed.

Link relevant types and APIs when that improves navigation or avoids duplicating
their documentation.

The result should make `cargo doc` useful to people understanding, using, or
developing the APIs. Provide sufficient but not excessive context and prefer
links over duplicated explanations.

Move package-development material that is currently in a user-facing README,
such as detailed validation instructions, into `DEV.md` when the split makes
both documents clearer.

Crate-level documentation should use `#![doc = include_str!("../README.md")]`
to avoid duplication. This is an intentional exception to the preference for
`//!` comments. Preserve all useful information when adopting this form and
update the README as needed.

Do not redesign a crate's public API merely to improve crate-level navigation.
If top-level exports are difficult to discover or require broader API changes,
record that as follow-up work. Improve links from existing top-level types where
possible without changing the API.

## Cleanup the code

Make small, non-breaking simplifications when they clearly improve readability,
maintainability, or correctness. Do not pursue speculative refactoring or churn
code solely to make it different. Record cleanup that could affect another
crate, API, format, or dependency as follow-up work.

Clarify complicated, error-prone, or potentially confusing code through better
identifier names, focused comments or documentation, and tests for fragile or
non-obvious behavior.

Where practical and clearly beneficial, favor immutability and pure functions
for algorithmically complex code to make reasoning and unit testing easier. If
this requires a meaningful refactor, include it as a Notable Event in the
workstream report.

## Improve testing

Inspect every function and method for worthwhile test coverage. Add focused
tests for meaningful behavior, edge cases, invariants, error paths, and
nontrivial logic where coverage is missing. Trivial accessors, forwarding
methods, and behavior already exercised adequately by higher-level tests do not
require dedicated tests.

When a new test fails, determine whether the test or production code is wrong.
Fix an incorrect test. When a production fix is small, local, and well
understood, fix it and retain the test as a regression test.

A valid test that reproduces a larger or uncertain product defect is valuable
iteration evidence and must not be reduced to prose. Commit the failing
reproducer on the workstream branch and record its commit, exact command,
expected behavior, and actual behavior in the report. For integration, retain
the test with `#[ignore]` and a precise known-defect reason when practical, and
verify that running it explicitly reproduces the failure. Record follow-up work
whose completion removes `#[ignore]`. Do not leave the normal crate or workspace
test suite failing on the integration branch.

Include every product bug fix and every retained bug reproducer as a Notable
Event in the workstream report.

## Validation and completion

Each workstream should run crate-scoped formatting, strict Clippy, rustdoc, and
tests appropriate to its changes. Its report should list changes, commands and
results, Notable Events, retained reproducers, and deferred opportunities.

At integration, run the canonical workspace commands from `DEVELOPMENT.md`, the
Rust-service documentation check, and the repository policy check. Run the
repository `pnpm build:fast` gate when changed Rust sources or manifests are
inputs to registered generated-WASM tasks. Integrated changes must pass these
normal gates; known defects are represented by explicitly runnable ignored
tests and follow-up records.
