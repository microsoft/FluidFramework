/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A TSDoc tag representing the release level of an API.
 */
export const ReleaseTag = {
	/**
	 * `@public`
	 */
	public: "public",
	/**
	 * `@beta`
	 */
	beta: "beta",
	/**
	 * `@alpha`
	 */
	alpha: "alpha",
	/**
	 * `@internal`
	 */
	internal: "internal",
} as const;
export type ReleaseTag = (typeof ReleaseTag)[keyof typeof ReleaseTag];

/**
 * Checks string to see if it is an {@link ReleaseTag}.
 *
 * @param tag - A potential {@link ReleaseTag} string.
 * @returns True when the level exactly matches a known {@link ReleaseTag}.
 */
export function isReleaseTag(tag: string): tag is ReleaseTag {
	return Object.hasOwn(ReleaseTag, tag);
}
