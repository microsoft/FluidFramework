# Add complete schema compatibility diagnostics to the alpha API

## Description

Schema compatibility results now explain all detected schema differences, not only the first failures.
The alpha API provides a complete difference list and separate lists of differences that prevent viewing, upgrading, or "equivalence".
This lets applications distinguish accepted differences from compatibility failures.

The analysis compares the view schema, current stored schema, and effective upgrade target.
It includes the root and detached node definitions, as well as staging annotations and persisted metadata.
Diagnostic entries have stable locations and ordering, contain JSON-compatible values, and do not expand recursive schema references.

Compatibility decisions and diagnostic failures now use shared comparison rules.
The existing viewing analysis supplies viewing failures and staged-upgrade information before the upgrade target is constructed.
Stored-schema comparisons report failures in both directions between the current schema and that target.
The checker derives compatibility flags from the corresponding failure lists.
Accepted structural and metadata differences remain separate from these decisions.

Boolean-only callers (the existing beta API) use the same stored-schema comparison rules and can stop at the first failure.
The internal failure representation does not depend on the new alpha diagnostic types.
Existing compatibility behavior, beta diagnostic output, and staged-upgrade accounting are preserved.

Diagnostic collection remains eager. Future optimizations can be considered as needed.

## Validation

Differential checks during consolidation matched the baseline for 4,802 schema and policy combinations and 104,991 stored-schema comparison cases.
These checks covered compatibility flags, beta diagnostics, and staged-upgrade status.
Regression tests cover complete failure reporting, detached definitions, constructability, diagnostic locations, and serialization.
After the latest changes, source and test builds, formatting, CLI lint, and all 78 focused tests pass.

## Reviewer Guidance

The review process is outlined in [the pull request guidelines](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/PR-Guidelines.md#guidelines).

Focus on the separation between difference discovery and compatibility policy, and on the mapping from semantic failures to diagnostic entries.
Every failed compatibility check must have at least one diagnostic entry, while accepted differences must not change compatibility flags.
