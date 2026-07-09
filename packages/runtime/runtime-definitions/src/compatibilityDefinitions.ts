/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Oldest version of Fluid Framework client packages required to open or process documents created or loaded by a container runtime.
 * @remarks
 * A string in SemVer format indicating a specific version of the Fluid Framework client package, or the special case of {@link @fluidframework/runtime-utils#defaultMinVersionForCollab}.
 *
 * Collaboration with other clients is only supported when all Fluid Framework client packages used by the client have a version that is greater than or equal
 * to the specified `MinDocumentRuntimeVersion`.
 *
 * Must be at least {@link @fluidframework/runtime-utils#lowestMinVersionForCollab} and cannot exceed the version of any Fluid Framework client package in use by the local client.
 *
 * The higher the version specified, the more features and optimizations will be enabled.
 *
 * {@link @fluidframework/runtime-utils#validateMinimumVersionForCollab} can be used to check these invariants at runtime.
 * Since TypeScript cannot enforce all of them for literals in code, it is useful for checking values sourced from constants typed as `MinDocumentRuntimeVersion`.
 *
 * @privateRemarks
 * Since this uses the semver notion of "greater" (which might not actually mean a later release, or supporting more features), care must be taken with how this is used.
 * See remarks for {@link @fluidframework/runtime-utils#MinimumMinorSemanticVersion} for more details.
 *
 * This scheme assumes a single version is always enough to communicate compatibility, which requires that compatibility is strictly increasing across releases.
 * There are ways this assumption could be violated (for example, a subset of incompatible features from 3.x is back-ported to 2.x, or compatibility depends on a patch that is not in the next minor's first release).
 * In such cases, a conservative enablement strategy can be used: only enable features for a version if all greater versions (based on semver ordering) also support it.
 * A more flexible scheme can be added if/when it's needed since it could be opt-in and thus non-breaking.
 *
 * Since this type is marked with `@input`, it is only consumed by the framework and never returned, so widening the accepted set is a non-breaking change.
 *
 * TODO: before stabilizing this further, some restrictions should be considered (since once stabilized, this can be relaxed, but not more constrained).
 * For example it might make sense to constrain this to something like:
 * ```ts
 * "1.4.0" | typeof defaultMinVersionForCollab | `2.${bigint}.0`
 * ```
 *
 * @input
 * @public
 */
export type MinDocumentRuntimeVersion =
	| `${1 | 2}.${bigint}.${bigint}`
	| `${1 | 2}.${bigint}.${bigint}-${string}`;

/**
 * Oldest version of Fluid Framework client packages to support collaborating with.
 *
 * @input
 * @public
 * @deprecated 2.112.0. Removed in 3.0.0. Use {@link MinDocumentRuntimeVersion} instead.
 */
export type MinimumVersionForCollab = MinDocumentRuntimeVersion;
