/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Oldest version of Fluid Framework client packages to support collaborating with.
 * @remarks
 * String in a SemVer format indicating a specific version of the Fluid Framework client package, or the special case of {@link @fluidframework/runtime-utils#defaultMinVersionForCollab}.
 *
 * When specifying a given `MinimumVersionForCollab`, any client with a version that is greater than or equal to the specified version will be considered compatible.
 *
 * Must be at least {@link @fluidframework/runtime-utils#lowestMinVersionForCollab} and cannot exceed the current version.
 *
 * @privateRemarks
 * Since this uses the semver notion of "greater" (which might not actually mean a later release, or supporting more features), care must be taken with how this is used.
 * See remarks for {@link @fluidframework/runtime-utils#MinimumMinorSemanticVersion} for more details.
 *
 * Since this type is marked with `@input`, it can be generalized to allow more cases in the future as a non-breaking change.
 *
 * TODO: before stabilizing this further, some restrictions should be considered (since once stabilized, this can be relaxed, but not more constrained).
 * For example it might make sense to constrain this to something like `"1.4.0" | typeof defaultMinVersionForCollab | 2.${bigint}.0"`.
 *
 * @input
 * @legacy @beta
 */
export type MinimumVersionForCollab =
	| `${1 | 2}.${bigint}.${bigint}`
	| `${1 | 2}.${bigint}.${bigint}-${string}`;
