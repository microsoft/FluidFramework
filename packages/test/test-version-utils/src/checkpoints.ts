/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Fluid Framework Compatibility Checkpoints.
 *
 * For more information, see CrossClientCompatibility.md, CrossClientCompatibilityDevGuide.md, and CompatibilityCheckpoints.md.
 */

import * as semver from "semver";

/**
 * Schema for a compatibility checkpoint.
 *
 * @internal
 */
export interface Checkpoint {
	readonly name: string;
	readonly index: number;
	/**
	 * Lower bound of the CC range.
	 */
	readonly openingVersion: string;
	/** ISO date (YYYY-MM-DD). */
	readonly earliestDate: string;
	/**
	 * Extra semver range fragments outside the `>=opening <next.opening`
	 * shape. Used by `getCurrentCheckpoint` to map versions like
	 * `2.0.0-rc.5.0.0` back to CC-1.
	 */
	readonly additionalRanges?: readonly string[];
}

/**
 * Hand-maintained list of designated compatibility checkpoints. Mirrors
 * the designated rows of the table in `CompatibilityCheckpoints.md` at
 * the repo root. Future / TBD checkpoints are intentionally not listed
 * here — append a new entry only once a checkpoint is officially designated.
 *
 * @internal
 */
export const checkpoints: readonly Checkpoint[] = [
	{
		name: "CC-1",
		index: 1,
		openingVersion: "1.4.0",
		earliestDate: "2024-04-09",
		additionalRanges: ["2.0.0-internal*", "2.0.0-rc*"],
	},
	{
		name: "CC-2",
		index: 2,
		openingVersion: "2.0.0",
		earliestDate: "2024-06-26",
	},
	{
		name: "CC-3",
		index: 3,
		openingVersion: "2.60.0",
		earliestDate: "2025-09-02",
	},
	{
		name: "CC-4",
		index: 4,
		openingVersion: "2.100.0",
		earliestDate: "2026-04-28",
	},
];

/**
 * Width of the cross-client compatibility window in either direction. Two
 * clients are guaranteed compatible iff their checkpoints are within
 * `windowRadius` indexes of each other (currently 3, ~18 months given
 * the 6-month cadence).
 *
 * @internal
 */
export const windowRadius = 3;

/**
 * Returns the highest checkpoint whose `openingVersion` is at or below
 * `version`. Returns `undefined` if `version` is below the earliest
 * checkpoint or is not a valid semver. A non-checkpoint version inherits
 * the compatibility guarantees of this checkpoint per the Cross-Client
 * Compatibility Policy.
 *
 * @internal
 */
export function getCurrentCheckpoint(version: string): Checkpoint | undefined {
	if (!semver.valid(version)) {
		return undefined;
	}
	const sorted = [...checkpoints].sort((a, b) => b.index - a.index);
	for (const c of sorted) {
		if (semver.gte(version, c.openingVersion)) {
			return c;
		}
		// CC-1 has additional ranges (2.0.0-internal*, 2.0.0-rc*) that
		// would otherwise be missed by a strict opening-version compare.
		if (c.additionalRanges?.some((r) => matchesRange(version, r))) {
			return c;
		}
	}
	return undefined;
}

/**
 * Returns the prior in-window checkpoints relative to `current` from newest to oldest.
 *
 * @internal
 */
export function getInWindowPriorCheckpoints(current: Checkpoint): Checkpoint[] {
	const result: Checkpoint[] = [];
	for (let i = 1; i <= windowRadius; i++) {
		const target = checkpoints.find((c) => c.index === current.index - i);
		if (target) {
			result.push(target);
		}
	}
	return result;
}

/**
 * Returns the semver range used to resolve a checkpoint to a single version.
 * We use tilde to get the latest patch for the earliest minor of a given checkpoint.
 *
 * @internal
 */
export function checkpointResolutionRange(checkpoint: Checkpoint): string {
	return `~${checkpoint.openingVersion}`;
}

/**
 * Returns `true` iff `version` matches `range`. Adds a tolerant fallback
 * for the wildcard-style additional ranges used in `CompatibilityCheckpoints.md`
 * (e.g., `2.0.0-internal*`), which aren't valid semver ranges by themselves.
 */
function matchesRange(version: string, range: string): boolean {
	if (semver.validRange(range)) {
		return semver.satisfies(version, range, { includePrerelease: true });
	}
	if (range.endsWith("*")) {
		const prefix = range.slice(0, -1);
		return version.startsWith(prefix);
	}
	return false;
}
