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
		openingVersion: "2.40.0",
		earliestDate: "2025-05-12",
	},
	{
		name: "CC-4",
		index: 4,
		openingVersion: "2.80.0",
		earliestDate: "2026-01-06",
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
 * `version`.
 *
 * @internal
 */
export function getCurrentCheckpoint(version: string): Checkpoint {
	if (!semver.valid(version)) {
		throw new Error(`Invalid version: "${version}"`);
	}
	// `additionalRanges` entries override the standard `openingVersion`
	// comparison. They exist for legacy prereleases (e.g. `2.0.0-internal*`)
	// that should map to an earlier checkpoint despite sorting at or above a
	// later one's opening version under semver rules.
	for (const c of checkpoints) {
		if (c.additionalRanges?.some((r) => matchesRange(version, r))) {
			return c;
		}
	}
	const parsed = semver.parse(version);
	const sorted = [...checkpoints].sort((a, b) => b.index - a.index);
	for (const c of sorted) {
		if (semver.gte(version, c.openingVersion)) {
			return c;
		}
		// A prerelease whose `major.minor.patch` equals a checkpoint's opening
		// version belongs to that checkpoint — `2.100.0-rc.0` is the
		// release-candidate of CC-4, not the tail end of CC-3, even though
		// `semver.gte("2.100.0-rc.0", "2.100.0")` is `false`.
		if (parsed !== null && parsed.prerelease.length > 0) {
			const opening = semver.parse(c.openingVersion);
			if (
				opening !== null &&
				parsed.major === opening.major &&
				parsed.minor === opening.minor &&
				parsed.patch === opening.patch
			) {
				return c;
			}
		}
	}
	// Throw if we reach here. Should be unreachable in practice since only versions before 1.4.0 would not match any checkpoint.
	throw new Error(`Version "${version}" is not associated with any checkpoint.`);
}

/**
 * Returns the prior in-window checkpoints relative to `current` from newest
 * to oldest. May return fewer than `windowRadius` entries when `current`
 * is near the start of the checkpoint list (e.g., `current === CC-1` returns
 * `[]`).
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
 * Returns `true` iff `version` matches `range`. The wildcard-suffix form
 * (e.g., `2.0.0-internal*`) is handled before falling through to
 * `semver.satisfies`, because `semver.validRange("2.0.0-internal*")` silently
 * coerces to `"2.0.0-internal"` (dropping the trailing `*`) which would not
 * match any prerelease version like `2.0.0-internal.7.3.0`. Throws on a
 * malformed entry rather than silently returning `false`, so authoring
 * mistakes in `additionalRanges` fail loudly at the first call site.
 */
function matchesRange(version: string, range: string): boolean {
	if (range.endsWith("*")) {
		const prefix = range.slice(0, -1);
		return version.startsWith(prefix);
	}
	if (semver.validRange(range)) {
		return semver.satisfies(version, range, { includePrerelease: true });
	}
	throw new Error(`Invalid additionalRanges entry: "${range}"`);
}
