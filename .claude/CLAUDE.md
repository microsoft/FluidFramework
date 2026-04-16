# Fluid Framework — Agent Context

> This file is mirrored in `.github/copilot-instructions.md`. Changes here should be duplicated there, and vice versa.

## Asserts

When writing asserts (from `@fluidframework/core-utils`), use a string literal for the error message, not a hex assert code. This applies only to newly added asserts, not existing ones.

## Azure DevOps

The ADO project for work items and pipelines is **`internal`** (not `FluidFramework`).
Use `internal` when calling ADO tools that require a project name.

### Internal Wiki

- **Name:** FF Internal Wiki
- **Wiki ID:** `4b8ab5e8-1add-4e4b-bb65-d9b870a98ad4`
- **Project:** `internal`
- **Mapped path:** `/docs` (page paths are relative to this — e.g. the api-council page is at `/dev/resources/api council`)

Use `mcp__ado__wiki_get_page_content` with `wikiIdentifier: "4b8ab5e8-1add-4e4b-bb65-d9b870a98ad4"` and `project: "internal"` to fetch pages directly by path without searching first.
