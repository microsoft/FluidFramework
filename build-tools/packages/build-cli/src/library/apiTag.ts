/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const ApiTag = {
	public: "public",
	beta: "beta",
	alpha: "alpha",
	internal: "internal",
} as const;
export type ApiTag = (typeof ApiTag)[keyof typeof ApiTag];

const knownApiTagSet: ReadonlySet<string> = new Set(Object.keys(ApiTag));

/**
 * Checks string to see if it is an {@link ApiTag}.
 *
 * @param tag - potential {@link ApiTag} string
 * @returns true when level exactly matches a known {@link ApiTag}
 */

export function isKnownApiTag(tag: string): tag is ApiTag {
	return knownApiTagSet.has(tag);
}
