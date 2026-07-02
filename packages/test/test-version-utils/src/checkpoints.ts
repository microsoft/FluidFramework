/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Fluid Framework Compatibility Checkpoints — single source of truth.
 *
 * Designated checkpoints drive the runtime test matrix. Future / TBD checkpoints are
 * listed below for documentation purposes only. Both sets populate the table in
 * `CompatibilityCheckpoints.md` at the repo root; run
 * `pnpm -r --filter @fluid-private/test-version-utils run update-compat-versions`
 * after any change to regenerate that table (and the compat workspaces).
 *
 * For more information, see CrossClientCompatibility.md, CrossClientCompatibilityDevGuide.md,
 * and CompatibilityCheckpoints.md.
 */

import * as semver from "semver";

/**
 * A designated compatibility checkpoint. Drives both the cross-client e2e test
 * matrix (via {@link getInWindowPriorCheckpoints}) and the generated table in
 * `CompatibilityCheckpoints.md` at the repo root.
 *
 * @internal
 */
export interface Checkpoint {
	/**
	 * Identifier for the checkpoint (i.e."CC#3").
	 */
	readonly name: string;
	/**
	 * Position in the checkpoint sequence (i.e. 1, 2, 3, ...). Must be unique and
	 * contiguous across {@link checkpoints} and {@link futureCheckpoints}.
	 * Used to determine which checkpoints are within the cross-client compat range.
	 */
	readonly index: number;
	/**
	 * Inclusive lower bound of this checkpoint's version range.
	 */
	readonly lowerBoundVersion: string;
	/**
	 * ISO `YYYY-MM-DD` date. For designated checkpoints, the release date of
	 * `lowerBoundVersion`. For TBD entries in {@link futureCheckpoints}, the estimated
	 * earliest date the checkpoint could be designated (6-month-cadence floor).
	 */
	readonly startDate: string;
	/**
	 * Extra semver ranges for versions that generic semver ranges do not
	 * capture (i.e. the `2.0.0-internal.x.y.z` releases for CC#1).
	 */
	readonly additionalRanges?: readonly string[];
}

/**
 * A {@link Checkpoint} extended with fields used only when rendering the
 * generated table in `CompatibilityCheckpoints.md`. Not used by any runtime
 * or test-matrix logic.
 */
interface DocumentedCheckpoint extends Checkpoint {
	/** `"designated"` rows have real versions/dates; `"tbd"` rows are estimates. */
	readonly status: "designated" | "tbd";
	/**
	 * Explicit upper bound (exclusive). When omitted, the upper bound is the next
	 * checkpoint's `lowerBoundVersion`. Set for the last designated checkpoint and the
	 * last checkpoint overall.
	 */
	readonly closingVersion?: string;
}

/**
 * Designated compatibility checkpoints. Append a new entry here only once a
 * checkpoint is officially designated, and remove the corresponding entry from
 * {@link futureCheckpoints} below.
 *
 * @internal
 */
export const checkpoints: readonly Checkpoint[] = [
	{
		name: "CC#1",
		index: 1,
		lowerBoundVersion: "1.4.0",
		startDate: "2024-04-09",
		additionalRanges: ["2.0.0-internal*", "2.0.0-rc*"],
	},
	{
		name: "CC#2",
		index: 2,
		lowerBoundVersion: "2.0.0",
		startDate: "2024-06-26",
	},
	{
		name: "CC#3",
		index: 3,
		lowerBoundVersion: "2.40.0",
		startDate: "2025-05-12",
	},
	{
		name: "CC#4",
		index: 4,
		lowerBoundVersion: "2.80.0",
		startDate: "2026-01-06",
	},
];

/**
 * Forecast of upcoming checkpoints, for documentation purposes only. Included so
 * the generated `CompatibilityCheckpoints.md` table shows any planned future checkpoints.
 * These are not consumed by any runtime or test-matrix logic.
 * When a checkpoint is officially designated, move its entry from here into
 * {@link checkpoints} above (and update its `startDate` to the actual release date).
 */
const futureCheckpoints: readonly DocumentedCheckpoint[] = [
	{
		name: "CC#5",
		index: 5,
		lowerBoundVersion: "3.0.0",
		startDate: "2026-08-24",
		status: "tbd",
	},
	{
		name: "CC#6",
		index: 6,
		lowerBoundVersion: "4.0.0",
		startDate: "2027-04-19",
		status: "tbd",
	},
	{
		name: "CC#7",
		index: 7,
		lowerBoundVersion: "5.0.0",
		startDate: "2027-12-06",
		status: "tbd",
		closingVersion: "6.0.0",
	},
];

/**
 * Size of the cross-client compatibility window in both directions (older and newer).
 * Two clients are guaranteed compatible if their checkpoints are within
 * `fullCompatibilityWindowSize` indexes of each other (currently 3, ~18 months given
 * the 6-month cadence).
 *
 * @internal
 */
export const fullCompatibilityWindowSize = 3;

/**
 * Returns the highest checkpoint whose `lowerBoundVersion` is at or below
 * `version`.
 *
 * @internal
 */
export function getCurrentCheckpoint(version: string): Checkpoint {
	if (!semver.valid(version)) {
		throw new Error(`Invalid version: "${version}"`);
	}
	// `additionalRanges` entries override the standard `lowerBoundVersion`
	// comparison. They exist for legacy prereleases (e.g. `2.0.0-internal*`)
	// that should map to an earlier checkpoint despite sorting at or above a
	// later one's lower bound version under semver rules.
	for (const c of checkpoints) {
		if (c.additionalRanges?.some((r) => matchesRange(version, r))) {
			return c;
		}
	}
	const parsed = semver.parse(version);
	const sorted = [...checkpoints].sort((a, b) => b.index - a.index);
	for (const c of sorted) {
		if (semver.gte(version, c.lowerBoundVersion)) {
			return c;
		}
		// A prerelease whose `major.minor.patch` equals a checkpoint's
		// `lowerBoundVersion` belongs to that checkpoint — `2.100.0-rc.0` is the
		// release-candidate of CC#4, not the tail end of CC#3, even though
		// `semver.gte("2.100.0-rc.0", "2.100.0")` is `false`.
		if (parsed !== null && parsed.prerelease.length > 0) {
			const lowerBound = semver.parse(c.lowerBoundVersion);
			if (
				lowerBound !== null &&
				parsed.major === lowerBound.major &&
				parsed.minor === lowerBound.minor &&
				parsed.patch === lowerBound.patch
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
 * to oldest. May return fewer than `fullCompatibilityWindowSize` entries when `current`
 * is near the start of the checkpoint list (e.g., `current === CC#1` returns
 * `[]`).
 *
 * @internal
 */
export function getInWindowPriorCheckpoints(current: Checkpoint): Checkpoint[] {
	const result: Checkpoint[] = [];
	for (let i = 1; i <= fullCompatibilityWindowSize; i++) {
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
	return `~${checkpoint.lowerBoundVersion}`;
}

/** Returns `true` iff `version` matches `range`, handling wildcard-suffix entries like `2.0.0-internal*`. */
function matchesRange(version: string, range: string): boolean {
	if (range.endsWith("*")) {
		return version.startsWith(range.slice(0, -1));
	}
	if (semver.validRange(range)) {
		return semver.satisfies(version, range, { includePrerelease: true });
	}
	throw new Error(`Invalid additionalRanges entry: "${range}"`);
}

// ---------------------------------------------------------------------------
// Documentation table generation
// ---------------------------------------------------------------------------

/** Path of the documentation file, relative to the repository root. @internal */
export const compatibilityCheckpointsDocRelativePath = "CompatibilityCheckpoints.md";

const designatedSourceRelativePath = "packages/test/test-version-utils/src/checkpoints.ts";

/** Sentinel marking the start of the auto-generated table block. */
const tableStartMarker = "<!-- GENERATED-TABLE-START -->";

/** Sentinel marking the end of the auto-generated table block. */
const tableEndMarker = "<!-- GENERATED-TABLE-END -->";

const doNotEditNotice = [
	"<!-- NOTE: This table is automatically generated. Do not update it directly. -->",
	`<!-- To modify this table, edit \`${designatedSourceRelativePath}\` then run \`pnpm -r --filter @fluid-private/test-version-utils run update-compat-versions\` -->`,
].join("\n");

/**
 * Explicit upper bounds for designated checkpoints whose range does not end at
 * the next checkpoint's `lowerBoundVersion`. Normally empty: a designated
 * checkpoint's range runs up to the next checkpoint's lower bound (the next
 * entry in {@link futureCheckpoints} when it is the latest designated one).
 */
const designatedClosingVersions: Readonly<Record<string, string>> = {};

const documentedCheckpoints: readonly DocumentedCheckpoint[] = [
	...checkpoints.map(
		(c): DocumentedCheckpoint => ({
			...c,
			status: "designated",
			...(designatedClosingVersions[c.name] === undefined
				? {}
				: { closingVersion: designatedClosingVersions[c.name] }),
		}),
	),
	...futureCheckpoints,
].sort((a, b) => a.index - b.index);

function escapeCell(value: string): string {
	return value.replace(/\|/g, "\\|");
}

function closingVersionOf(
	checkpoint: DocumentedCheckpoint,
	index: number,
): { version: string; estimated: boolean } {
	if (checkpoint.closingVersion !== undefined) {
		return { version: checkpoint.closingVersion, estimated: checkpoint.status === "tbd" };
	}
	const next = documentedCheckpoints[index + 1];
	if (next === undefined) {
		throw new Error(
			`Checkpoint "${checkpoint.name}" has no following checkpoint and no closingVersion.`,
		);
	}
	// The upper bound is the next checkpoint's lower bound; it is an estimate when
	// that next checkpoint is not yet designated (e.g. the latest designated
	// checkpoint closes at the first forecasted future checkpoint).
	return { version: next.lowerBoundVersion, estimated: next.status === "tbd" };
}

function renderName(c: DocumentedCheckpoint): string {
	return c.status === "tbd" ? `${c.name} (TBD)` : c.name;
}

function renderDate(c: DocumentedCheckpoint): string {
	return c.status === "tbd" ? `~${c.startDate}` : c.startDate;
}

function renderVersionRange(c: DocumentedCheckpoint, i: number): string {
	const closing = closingVersionOf(c, i);
	const additional = (c.additionalRanges ?? []).map((r) => ` | ${r}`).join("");
	const range = `\`>=${c.lowerBoundVersion} <${closing.version}${additional}\``;
	return closing.estimated ? `${range}(estimated)` : range;
}

function compatibleCheckpointsOf(c: DocumentedCheckpoint): DocumentedCheckpoint[] {
	return documentedCheckpoints.filter(
		(x) => Math.abs(x.index - c.index) <= fullCompatibilityWindowSize,
	);
}

function renderCompatibleCheckpoints(c: DocumentedCheckpoint): string {
	return compatibleCheckpointsOf(c)
		.map((x) => x.name)
		.join(", ");
}

function renderCompatibleSemanticVersions(c: DocumentedCheckpoint): string {
	const window = compatibleCheckpointsOf(c);
	const lowest = window[0];
	const highest = window[window.length - 1];
	const closing = closingVersionOf(highest, documentedCheckpoints.indexOf(highest));
	const estimated = closing.estimated ? "(estimated)" : "";
	const additionalRanges = window.flatMap((x) => x.additionalRanges ?? []);
	// Wrap additional ranges in their own code span (e.g. `| 2.0.0-internal* | 2.0.0-rc*`),
	// adjacent to the version range span. The `|` chars are escaped by escapeCell later.
	const additionalPart =
		additionalRanges.length > 0 ? `\` | ${additionalRanges.join(" | ")}\`` : "";
	return `\`>=${lowest.lowerBoundVersion} <${closing.version}\`${estimated}${additionalPart}`;
}

function renderRow(c: DocumentedCheckpoint, i: number): string {
	const cells = [
		renderName(c),
		renderVersionRange(c, i),
		renderDate(c),
		renderCompatibleCheckpoints(c),
		renderCompatibleSemanticVersions(c),
	].map(escapeCell);
	return `| ${cells.join(" | ")} |`;
}

/**
 * Renders the generated table block (do-not-edit notice + header + data rows).
 */
function renderCheckpointsTable(): string {
	const rows = documentedCheckpoints.map((c, i) => renderRow(c, i)).join("\n");
	return [
		doNotEditNotice,
		"",
		"<!-- prettier-ignore -->",
		"| Checkpoint | Version Range | Start Date | Compatible Checkpoints | Compatible Semantic Versions |",
		"| --- | --- | --- | --- | --- |",
		rows,
	].join("\n");
}

/**
 * Replaces the content between {@link tableStartMarker} and {@link tableEndMarker}
 * in `docContent` with the freshly rendered table, preserving all surrounding prose.
 * @internal
 */
export function injectCheckpointsTable(docContent: string): string {
	const start = docContent.indexOf(tableStartMarker);
	const end = docContent.indexOf(tableEndMarker);
	if (start === -1 || end === -1) {
		throw new Error(
			`Could not find table sentinels in ${compatibilityCheckpointsDocRelativePath}. ` +
				`Expected both "${tableStartMarker}" and "${tableEndMarker}".`,
		);
	}
	const before = docContent.slice(0, start + tableStartMarker.length);
	const after = docContent.slice(end);
	// A blank line before the END marker keeps output stable under Prettier.
	return `${before}\n${renderCheckpointsTable()}\n\n${after}`;
}
