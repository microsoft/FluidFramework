/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A type that represents independent packages (as opposed to those that are part of a release group).
 *
 * @remarks
 *
 * This type is an alias for string now but it could become a real class/interface in the future. Right now it is the
 * full package name including scope.
 *
 * @internal
 */
export type ReleasePackage = string;

/**
 * An array of known release groups.
 */
export const knownReleaseGroups = [
	"build-tools",
	"client",
	"server",
	"gitrest",
	"historian",
] as const;

/**
 * A type that represents release groups.
 */
export type ReleaseGroup = (typeof knownReleaseGroups)[number];

/**
 * A type guard used to determine if a string is a ReleaseGroup.
 */
export function isReleaseGroup(str: string | undefined): str is ReleaseGroup {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
	return str === undefined ? false : knownReleaseGroups.includes(str as any);
}

/**
 * A type that represents where a release can originate. Most release groups use the releaseBranches value, and
 * individual packages use the direct value, which indicates releases originate from the main/lts branches. The
 * interactive value means the user should be asked to define the source dynamically.
 */
export type ReleaseSource = "direct" | "releaseBranches" | "interactive";
