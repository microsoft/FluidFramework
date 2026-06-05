# Fluid Framework Compatibility Checkpoint Releases

This page lists all designated compatibility checkpoint releases for the Fluid Framework.
See the [Cross-Client Compatibility Policy](./CrossClientCompatibility.md#cross-client-compatibility-policy)
for how checkpoints define the compatibility window.

## Schedule

Checkpoints are designated on a cadence of **no less than 6 months**. Any two clients
whose checkpoint releases are within **18 months** of each other (spanning Checkpoint N
through Checkpoint N-3) are guaranteed to be cross-client compatible.

## Checkpoints

The **Version Range** column lists the semver range of Fluid Framework releases
that fall under the checkpoint; every release in the range shares the same
cross-client compatibility guarantees as the opening release (the range's lower
bound).

The **Compatible Semantic Versions** column lists the full semver range a
client running a checkpoint version is guaranteed to be compatible with. Upper
bounds for in-window checkpoints are estimated and depend on when future
checkpoints are designated.

<!-- GENERATED-TABLE-START -->
<!-- NOTE: This table is automatically generated. Do not update it directly. -->
<!-- To modify this table, edit `packages/test/test-version-utils/src/checkpoints.ts` then run `pnpm --filter @fluid-private/test-version-utils run generate-checkpoints-doc` -->

<!-- prettier-ignore -->
| Checkpoint | Version Range | Start Date | Compatible Checkpoints | Compatible Semantic Versions |
| --- | --- | --- | --- | --- |
| CC-1 | `>=1.4.0 <2.0.0 \| 2.0.0-internal* \| 2.0.0-rc*` | 2024-04-09 | CC-1, CC-2, CC-3, CC-4 | `>=1.4.0 <2.101.0`` \| 2.0.0-internal* \| 2.0.0-rc*` |
| CC-2 | `>=2.0.0 <2.40.0` | 2024-06-26 | CC-1, CC-2, CC-3, CC-4, CC-5 | `>=1.4.0 <4.0.0`(estimated)` \| 2.0.0-internal* \| 2.0.0-rc*` |
| CC-3 | `>=2.40.0 <2.80.0` | 2025-05-12 | CC-1, CC-2, CC-3, CC-4, CC-5, CC-6 | `>=1.4.0 <5.0.0`(estimated)` \| 2.0.0-internal* \| 2.0.0-rc*` |
| CC-4 | `>=2.80.0 <2.101.0` | 2026-01-06 | CC-1, CC-2, CC-3, CC-4, CC-5, CC-6, CC-7 | `>=1.4.0 <6.0.0`(estimated)` \| 2.0.0-internal* \| 2.0.0-rc*` |
| CC-5 (TBD) | `>=3.0.0 <4.0.0`(estimated) | ~2026-07-06 | CC-2, CC-3, CC-4, CC-5, CC-6, CC-7 | `>=2.0.0 <6.0.0`(estimated) |
| CC-6 (TBD) | `>=4.0.0 <5.0.0`(estimated) | ~2027-01-06 | CC-3, CC-4, CC-5, CC-6, CC-7 | `>=2.40.0 <6.0.0`(estimated) |
| CC-7 (TBD) | `>=5.0.0 <6.0.0`(estimated) | ~2027-07-06 | CC-4, CC-5, CC-6, CC-7 | `>=2.80.0 <6.0.0`(estimated) |

<!-- GENERATED-TABLE-END -->

> **Notes:**
>
> 1. `CC-1` through `CC-4` were designated retroactively based on existing
>    Fluid Framework releases, which is why the cadence between them is
>    irregular. Starting with `CC-5`, checkpoints follow the standard cadence.
> 2. Dates and version ranges for future checkpoints are estimates and are
>    subject to change. Exact release versions and dates will be added as each
>    checkpoint is designated.
