/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { SemVer } from "semver";

/**
 * A type alias for strings that represent package versions.
 */
export type ReleaseVersion = string;

/**
 * A type defining the three basic version bump types:
 *
 * - major
 *
 * - minor
 *
 * - patch
 */
export type VersionBumpType = "major" | "minor" | "patch";

/**
 * A type defining the three basic version bump types plus an additional value "current", which is used to indicate a
 * no-op version bump.
 */
export type VersionBumpTypeExtended = VersionBumpType | "current";

/**
 * A union type representing either a {@link VersionBumpType} or a specified version.
 */
export type VersionChangeType = VersionBumpType | SemVer;

/**
 * A union type representing either a {@link VersionBumpTypeExtended} or a specified version.
 */
export type VersionChangeTypeExtended = VersionBumpTypeExtended | SemVer;

/**
 * A typeguard to check if a version is a {@link VersionBumpType}.
 */
export function isVersionBumpType(
    type: VersionChangeType | string | undefined,
): type is VersionBumpType {
    return type === undefined ? false : type === "major" || type === "minor" || type === "patch";
}

/**
 * A typeguard to check if a version is a {@link VersionBumpTypeExtended}.
 */
export function isVersionBumpTypeExtended(
    type: VersionChangeType | string,
): type is VersionBumpTypeExtended {
    return type === "major" || type === "minor" || type === "patch" || type === "current";
}
