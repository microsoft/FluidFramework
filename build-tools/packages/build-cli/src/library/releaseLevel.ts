/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The release level of an API.
 * @remarks Derived from {@link https://github.com/microsoft/FluidFramework/wiki/Release-Tags | TSDoc release tags}.
 */
export const ReleaseLevel = {
	/**
	 * Corresponding TSDoc tag: `@public`
	 */
	public: "public",
	/**
	 * Corresponding TSDoc tag: `@beta`
	 */
	beta: "beta",
	/**
	 * Corresponding TSDoc tag: `@alpha`
	 */
	alpha: "alpha",
	/**
	 * Corresponding TSDoc tag: `@internal`
	 */
	internal: "internal",
} as const;
export type ReleaseLevel = (typeof ReleaseLevel)[keyof typeof ReleaseLevel];

/**
 * Checks string to see if it is an {@link ReleaseLevel}.
 *
 * @param maybeLevel - A potential {@link ReleaseLevel} string.
 * @returns True when the level exactly matches a known {@link ReleaseLevel}.
 */
export function isReleaseLevel(maybeLevel: string): maybeLevel is ReleaseLevel {
	return Object.hasOwn(ReleaseLevel, maybeLevel);
}
