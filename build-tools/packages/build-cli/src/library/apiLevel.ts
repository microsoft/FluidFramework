/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// These types are very similar to those defined and used in the `release setPackageTypesField` command, but that
// command is likely to be deprecated soon, so no effort has been made to unify them.

export const ApiLevel = {
	public: "public",
	beta: "beta",
	alpha: "alpha",
	internal: "internal",
	legacyAlpha: "legacyAlpha",
	legacyBeta: "legacyBeta",
	legacyPublic: "legacyPublic",
} as const;
export type ApiLevel = (typeof ApiLevel)[keyof typeof ApiLevel];

/**
 * Tuple of {@link ApiLevel}s
 *
 * @remarks Sorted by the preferred order that respective imports would exist.
 * public is effectively "" for sorting purposes and then all are arranged
 * alphabetically as most formatters would prefer.
 */
export const knownApiLevels = [
	ApiLevel.public,
	ApiLevel.alpha,
	ApiLevel.beta,
	ApiLevel.internal,
	ApiLevel.legacyPublic,
	ApiLevel.legacyBeta,
	ApiLevel.legacyAlpha,
] as const;

const knownApiLevelSet: ReadonlySet<string> = new Set(knownApiLevels);

/**
 * Checks string to see if it is an {@link ApiLevel}.
 *
 * @param level - potential {@link ApiLevel} string
 * @returns true when level exactly matches a known {@link ApiLevel}
 */
export function isKnownApiLevel(level: string): level is ApiLevel {
	return knownApiLevelSet.has(level);
}
