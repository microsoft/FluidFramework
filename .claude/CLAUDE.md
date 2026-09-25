# Fluid Framework — Agent Context

> This file is mirrored in `.github/copilot-instructions.md`. Changes here should be duplicated there, and vice versa.

## Coding Guidelines

Follow the [Coding Guidelines](../docs/content/Guidelines/Coding-Guidelines.md) when writing / modifying code.

## Documentation Guidelines

Follow the [Documentation Guidelines](../docs/content/Guidelines/Documentation-Guidelines.md) when writing or modifying code or documentation.
Read and follow the linked guides relevant to the task, including the language-specific guides for source-code documentation.
These requirements apply to source-code comments and API documentation as well as standalone documentation.

## Changesets

Add a changeset for user-facing changes only if the affected release group uses changesets.
Before writing or modifying a changeset, read and follow the [Changeset Guidelines](../.changeset/README.md).

## Asserts

When writing asserts (from `@fluidframework/core-utils`), use a string literal for the error message, not a hex assert code. This applies only to newly added asserts, not existing ones.

## Internal Interface Type Checks

When adding or changing a cast that accesses internal capabilities on a known concrete implementation, ensure the implementation is checked against the internal interface:

- Prefer `implements` when API constraints allow it. First check for existing enforcement through inherited interfaces, typed wrappers, or factories; do not duplicate it without a specific reason.
- Otherwise, add a compile-time `requireAssignableTo<Actual, Expected>` check. Reuse the existing helper from `@fluidframework/build-tools` where that dependency is available, using a type-only import.
- For TypeScript-private members, derive the checked shape from the actual member types in the source module. Emitted declarations can erase private member types. Do not make members public or cast away mismatches to make the check pass.
- Use `Required<Interface>` only when the concrete implementation guarantees every optional capability. Keep cross-version optionality on the interface itself.
- Explain each check and any intentional exclusions or adaptations in TSDoc. Verify that incompatible member changes make the check fail.

Examples: [parent-context type tests](../packages/runtime/container-runtime/src/test/types/internalInterfaces.ts) and the source-local `_checkInternalConfig` in [FluidDataStoreRuntime](../packages/runtime/datastore/src/dataStoreRuntime.ts).

## API Reports (`*.api.md`)

API report files are **generated artifacts** — never hand-edit them. If they need updating, rebuild and regenerate via `build:api-reports`. If you are working in `@fluidframework/tree` or its aggregator (`fluid-framework`) and encounter unexpected API report diffs, read `.claude/skills/ci-readiness-check/tree-api-checks.md` before attempting to fix them.

## Documentation Style

When writing Markdown and documentation comments, prefer line breaks at semantically significant boundaries, such as the end of a sentence or a meaningful clause.
Do not wrap prose at an arbitrary fixed column unless syntax, established file style, or readability requires it.

## Azure DevOps

The ADO project for work items and pipelines is **`internal`** (not `FluidFramework`).
Use `internal` when calling ADO tools that require a project name.

### Referencing GitHub issues/PRs in ADO text

When writing ADO work-item fields (Description, comments, etc.), never reference a GitHub issue or PR with a bare `#<number>` (or `AB#<number>`) — ADO auto-links those to a work item in the `internal` org, not to GitHub. Always use the full URL `https://github.com/microsoft/FluidFramework/pull/<n>` (or `/issues/<n>`), ideally as a markdown link like `[PR #<n>](url)`. Reserve bare `#<n>` / `AB#<n>` for actual ADO work items.

### Internal Wiki

- **Name:** FF Internal Wiki
- **Wiki ID:** `4b8ab5e8-1add-4e4b-bb65-d9b870a98ad4`
- **Project:** `internal`
- **Mapped path:** `/docs` (page paths are relative to this — e.g. the api-council page is at `/dev/resources/api council`)

Use `mcp__ado__wiki_get_page_content` with `wikiIdentifier: "4b8ab5e8-1add-4e4b-bb65-d9b870a98ad4"` and `project: "internal"` to fetch pages directly by path without searching first.
