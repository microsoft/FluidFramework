/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Oldest Fluid Framework client version that must be able to open and process documents written
 * by newer clients.
 * @remarks
 * A string in SemVer format indicating a specific stable version of the Fluid Framework client package.
 *
 * The framework uses this value to select write formats and features. Clients using this version
 * or newer must be able to open and process documents written by newer clients. Choosing an older
 * version may limit the features and write formats the application can use to those supported by
 * that version. Clients using older versions may still be able to access a document if no
 * incompatible data has been written.
 *
 * Collaboration with other clients is supported when all Fluid Framework client packages used by the client have a version that is greater than or equal
 * to the specified `OldestSupportedClientVersion`.
 *
 * Client 3.0 supports stable 2.x versions and 3.x minor checkpoints whose patch is zero. Every
 * active deployment that must collaborate needs to use Fluid Framework 2.0.0 or later before
 * upgrading.
 *
 * Deployed-client values must be at least {@link @fluidframework/runtime-utils#lowestMinVersionForCollab}
 * and cannot exceed the version of any Fluid Framework client package in use by the local client.
 * APIs that still permit this setting to be omitted use
 * {@link @fluidframework/runtime-utils#defaultMinVersionForCollab}.
 *
 * {@link @fluidframework/runtime-utils#validateMinimumVersionForCollab} can be used to check these invariants at runtime.
 * Since TypeScript cannot enforce all of them for literals in code, it is useful for checking values sourced from constants typed as `OldestSupportedClientVersion`.
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
 * Historically, this type allowed arbitrary patch versions, but as noted above that is problematic for ordering, so only the major and minor versions are supported for new majors:
 * support for patch versions can be aged out as support for version 2 is dropped (or simply deprecated and removed in a later major version).
 * Once gone that simplification is done, this type will align with {@link @fluidframework/driver-definitions#OldestSupportedServiceClientVersion} and the two types can be deduplicated.
 *
 * In the future, we may want to generalize this to mean
 * "a value that compares less than or equal to the oldest Fluid Framework client version that must be able to open and process the container".
 * As a non-breaking change, we could then allow values such as "3.1" without requiring the trailing ".0".
 * However, omitting ".0" has some complications on the implementation side and might make the value look less like a version and obscure semver ordering;
 * for example, how "3.21" is greater than "3.3".
 * We may therefore want to retain the ".0" for simplicity and clarity.
 *
 * @input
 * @public
 */
export type OldestSupportedClientVersion = `3.${bigint}.0` | `2.${bigint}.${bigint}`;

/**
 * Oldest version of Fluid Framework client packages that must be able to open and process
 * documents written by newer clients.
 *
 * @deprecated 2.116.0. To be removed in 4.0.0. Use {@link OldestSupportedClientVersion} instead.
 * See {@link https://github.com/microsoft/FluidFramework/issues/27851} for context.
 * @input
 * @public
 */
export type MinimumVersionForCollab = OldestSupportedClientVersion;
