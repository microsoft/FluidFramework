/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Oldest version of Fluid Framework client packages to support collaborating with.
 * @remarks
 * String in a semver format of indicating a specific version of the Fluid Framework client package, or the special case of {@link defaultMinVersionForCollab}.
 *
 * When specifying a given `MinimumVersionForCollab`, any version which is greater then or equal to the specified version will be considered compatible.
 *
 * Must be at least {@link @fluidframework/runtime-utils#lowestMinVersionForCollab} and cannot exceed the current version.
 *
 * @privateRemarks
 * Since this uses the semver notion of "greater" (which might not actually mean a later release, or supporting more features), care must be taken with how this is used.
 * See remarks for {@link @fluidframework/runtime-utils#MinimumMinorSemanticVersion} for more details.
 *
 * Since this type is marked with `@input`, it can be generalized to allow more cases in the future as a non-breaking change.
 *
 * @input
 *
 * @legacy @beta
 */
export type MinimumVersionForCollab =
	| `1.0.0`
	| `1.4.0`
	| typeof defaultMinVersionForCollab
	| `2.${bigint}.0`;

/**
 * Our policy is to support N/N-1 compatibility by default, where N is the most
 * recent public major release of the runtime.
 * Therefore, if the customer does not provide a minVersionForCollab, we will
 * default to use N-1.
 *
 * However, this is not consistent with today's behavior. Some options (i.e.
 * batching, compression) are enabled by default despite not being compatible
 * with 1.x clients. Since the policy was introduced during 2.x's lifespan,
 * N/N-1 compatibility by **default** will be in effect starting with 3.0.
 * Importantly though, N/N-2 compatibility is still guaranteed with the proper
 * configurations set.
 *
 * Further to distinguish unspecified `minVersionForCollab` from a specified
 * version and allow `enableExplicitSchemaControl` to default to `true` for
 * any 2.0.0+ version, we will use a special value of `1.999.0`, which
 * is semantically less than 2.0.0.
 *
 * @legacy @beta
 */
export const defaultMinVersionForCollab = "1.999.0";
