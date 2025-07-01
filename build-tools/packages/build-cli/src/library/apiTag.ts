/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: clean up this mess

export const ReleaseTag = {
	public: "public",
	beta: "beta",
	alpha: "alpha",
	internal: "internal",
} as const;
export type ReleaseTag = (typeof ReleaseTag)[keyof typeof ReleaseTag];

/**
 * Checks string to see if it is an {@link ApiTag}.
 *
 * @param tag - potential {@link ReleaseTag} string
 * @returns true when level exactly matches a known {@link ApiTag}
 */
export function isReleaseTag(tag: string): tag is ReleaseTag {
	return Object.hasOwn(ReleaseTag, tag);
}
