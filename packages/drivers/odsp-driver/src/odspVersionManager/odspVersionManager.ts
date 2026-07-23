/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Selects the ODSP file version whose snapshot sits at or before a target Fluid sequence number —
 * the base to load or replay from when materializing a document at a point in time.
 *
 * The selection logic depends on an injected {@link IOdspFileVersionFetcher}, so it is independent of
 * how versions are enumerated and resolved (real ODSP, a test double, or an alternative backend).
 */

import { NonRetryableError } from "@fluidframework/driver-utils/internal";
import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";
import { UsageError, type TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { pkgVersion as driverVersion } from "../packageVersion.js";

import {
	createOdspFileVersionFetcher,
	type OdspFileVersionFetcherProps,
} from "./odspFileVersionFetcher.js";

/**
 * A single ODSP file version, as listed by the file's version history.
 */
export interface OdspFileVersionRef {
	/**
	 * The version's label (e.g. `"42.0"`), used to address the version when fetching it.
	 */
	readonly versionId: string;
	/**
	 * Last-modified timestamp of this version, ISO-8601.
	 */
	readonly lastModifiedDateTime: string;
}

/**
 * An ODSP file version together with its resolved Fluid sequence number.
 */
export interface ResolvedVersion extends OdspFileVersionRef {
	/**
	 * The Fluid sequence number the version's snapshot represents.
	 */
	readonly sequenceNumber: number;
}

/**
 * Result of resolving the base version for a target sequence number.
 *
 * @remarks
 * There is intentionally no `targetIsLive` case: when the target is at/after the newest recoverable
 * version, the greatest version with `seq <= target` IS that newest version, so it is a normal
 * `found`. A consumer may separately choose to load the live file when the target is near the head.
 */
export type BaseForSeq =
	| {
			/** A recoverable version with `sequenceNumber <= target` was found. */
			readonly kind: "found";
			readonly base: ResolvedVersion;
	  }
	| {
			/** No recoverable version has `sequenceNumber <= target` (target predates retained history). */
			readonly kind: "noBaseVersion";
			/** The oldest sequence number that was resolved while searching, if any. */
			readonly oldestResolvedSeq?: number;
	  };

/**
 * Provides a file's versions and resolves each version's Fluid sequence number. Injected into
 * the version manager so the selection logic does not depend on how versions are fetched.
 */
export interface IOdspFileVersionFetcher {
	/**
	 * Enumerate the file's versions, newest-first.
	 */
	listFileVersions(): Promise<OdspFileVersionRef[]>;
	/**
	 * Resolve a single version's Fluid sequence number. Throws on failure rather than returning a
	 * wrong value.
	 */
	resolveSequenceNumber(versionId: string): Promise<number>;
	/**
	 * Read the live document's current ODSP epoch (`x-fluid-epoch`), or `undefined` if the server
	 * does not return one. "Epoch" identifies the file's binary lineage and changes on a version
	 * restore or download-then-reupload; compared with {@link getRecoverableVersionEpoch} to confirm a base is
	 * on the live document's lineage before replaying ops across them.
	 */
	getLiveDocumentEpoch(): Promise<string | undefined>;
	/**
	 * Read the ODSP epoch associated with a specific file version, or `undefined`. See {@link getLiveDocumentEpoch}.
	 */
	getRecoverableVersionEpoch(versionId: string): Promise<string | undefined>;
	/**
	 * Fetch the sequence numbers the server currently retains in the half-open range `[from, to)`,
	 * ascending. Retention is finite (e.g. ~7 days), so the server may return fewer ops, or ops
	 * starting above `from` when the low end has been trimmed; the caller uses the gap to detect
	 * missing ops.
	 */
	fetchOps(from: number, to: number): Promise<number[]>;
}

/**
 * Selects the file version to use as the base for loading or replaying to a target sequence number.
 */
export interface IOdspVersionManager {
	/**
	 * Given a target sequence number, return the closest version at or before it (`found`), or
	 * `noBaseVersion` if the target predates the oldest retained version.
	 */
	findBaseForSeq(target: number): Promise<BaseForSeq>;
	/**
	 * Verify a base version selected by {@link findBaseForSeq} can actually be replayed forward to
	 * `target`, throwing a clear error if not. Checks two things: that the base and the live document
	 * share the same ODSP epoch (a version restore or download-then-reupload bumps the epoch and
	 * renumbers the op stream, making the base a different lineage), and that every op in
	 * `(base.sequenceNumber, target]` is still retained and contiguous (retention is finite, e.g.
	 * ~7 days, so a base older than the window can have the bridging ops already trimmed).
	 */
	validateBaseForReplay(base: ResolvedVersion, target: number): Promise<void>;
}

/**
 * Default {@link IOdspVersionManager}. Caches the version list and resolved sequence numbers. The
 * resolution strategy (eager, newest-to-oldest, stopping at the first usable base) is hidden behind
 * {@link findBaseForSeq} and can change without affecting callers.
 */
export class OdspVersionManager implements IOdspVersionManager {
	private versionsCache: Promise<OdspFileVersionRef[]> | undefined;
	private readonly seqByVersion = new Map<string, Promise<number>>();

	public constructor(
		private readonly fetcher: IOdspFileVersionFetcher,
		private readonly logger?: TelemetryLoggerExt,
	) {}

	public refresh(): void {
		this.versionsCache = undefined;
		this.seqByVersion.clear();
	}

	public async findBaseForSeq(target: number): Promise<BaseForSeq> {
		// Recoverable base candidates = every version except the tip (index 0 ≈ the live document).
		const versions = await this.getVersions();
		const candidates = versions.slice(1);

		// Versions are listed newest-first, and version order is expected to track sequence number, so
		// the first candidate whose seq is at or before the target is taken as the closest base. Because
		// any base at or before the target replays forward to the same state, this early stop is an
		// optimization, not a correctness requirement: if version order and sequence order ever diverge,
		// a base that is valid but not strictly the closest may be chosen.
		// Scanning newest-first also yields the newest of versions sharing a sequence number (dedup).
		let oldestResolvedSeq: number | undefined;
		for (const version of candidates) {
			const sequenceNumber = await this.resolveSeq(version.versionId);
			oldestResolvedSeq =
				oldestResolvedSeq === undefined
					? sequenceNumber
					: Math.min(oldestResolvedSeq, sequenceNumber);
			if (sequenceNumber <= target) {
				return { kind: "found", base: { ...version, sequenceNumber } };
			}
		}
		return { kind: "noBaseVersion", oldestResolvedSeq };
	}

	public async validateBaseForReplay(base: ResolvedVersion, target: number): Promise<void> {
		// Check lineage first: if the base is on a different epoch than the live document, the op
		// availability check below would be meaningless (the ops belong to a renumbered stream).
		await this.validateLineageEpoch(base);
		await this.validateOpsAvailable(base.sequenceNumber, target);
	}

	private async validateLineageEpoch(base: ResolvedVersion): Promise<void> {
		const [liveEpoch, baseEpoch] = await Promise.all([
			this.fetcher.getLiveDocumentEpoch(),
			this.fetcher.getRecoverableVersionEpoch(base.versionId),
		]);
		// Log the observed epochs so real traffic can confirm whether the version-scoped read actually
		// returns a per-lineage epoch (vs. the file's current epoch). If they always match here, the
		// op-availability check - not this epoch comparison - is what guards against a cross-lineage base.
		this.logger?.sendTelemetryEvent({
			eventName: "PointInTimeBaseLineageEpoch",
			baseVersionId: base.versionId,
			baseEpoch,
			liveEpoch,
			epochsMatch:
				baseEpoch !== undefined && liveEpoch !== undefined && baseEpoch === liveEpoch,
		});
		// Fail closed when either epoch is unknown: without both we cannot prove the base shares the
		// live document's lineage, and replaying across lineages silently corrupts the result.
		if (liveEpoch === undefined || baseEpoch === undefined) {
			throw new UsageError(
				`Cannot verify that ODSP file version ${base.versionId} shares the live document's ` +
					`lineage (base epoch: ${baseEpoch ?? "unknown"}, live epoch: ${liveEpoch ?? "unknown"}).`,
			);
		}
		if (liveEpoch !== baseEpoch) {
			// Reuse the driver's canonical epoch-mismatch error (the same errorType the shared
			// EpochTracker raises when a cross-lineage read is detected - see epochTracker.ts
			// checkForEpochErrorCore), so the loader sees one consistent, machine-readable errorType
			// for "the base is on a different lineage than the live document" rather than a generic
			// UsageError. It is correctly non-retryable: a lineage mismatch never resolves on retry.
			// clientEpoch is the epoch we hold (the chosen base); serverEpoch is the live document's.
			throw new NonRetryableError(
				`ODSP file version ${base.versionId} is on epoch "${baseEpoch}" but the live document is ` +
					`on epoch "${liveEpoch}". A binary file change (e.g. a version restore or ` +
					`download-and-reupload) renumbered the op stream, so ops cannot be replayed from this ` +
					`base onto the live document.`,
				OdspErrorTypes.fileOverwrittenInStorage,
				{
					driverVersion,
					serverEpoch: liveEpoch,
					clientEpoch: baseEpoch,
				},
			);
		}
	}

	private async validateOpsAvailable(baseSeq: number, target: number): Promise<void> {
		// The base snapshot already represents state at baseSeq, so only ops in (baseSeq, target] are
		// replayed. Nothing to verify when the target is at or before the base.
		if (target <= baseSeq) {
			return;
		}
		// Walk the range, requesting everything still needed up to and including the target. The
		// server returns ops ascending and may cap a response, so loop until `expected` passes target.
		let expected = baseSeq + 1;
		while (expected <= target) {
			// fetchOps is half-open [from, to); target + 1 makes the target op itself eligible.
			const sequenceNumbers = await this.fetcher.fetchOps(expected, target + 1);
			if (sequenceNumbers.length === 0) {
				throw new UsageError(
					`Ops required to replay the ODSP document from sequence number ${baseSeq} to ${target} ` +
						`are no longer available: the server returned no ops at or after sequence number ` +
						`${expected} (they were likely trimmed by op retention).`,
				);
			}
			for (const sequenceNumber of sequenceNumbers) {
				if (sequenceNumber > target) {
					// The requested upper bound already excludes ops past the target; ignore defensively.
					break;
				}
				if (sequenceNumber !== expected) {
					throw new UsageError(
						`Ops required to replay the ODSP document from sequence number ${baseSeq} to ` +
							`${target} are not contiguous: expected sequence number ${expected} but the next ` +
							`available op is ${sequenceNumber} (a gap means ops are missing, e.g. trimmed by ` +
							`op retention).`,
					);
				}
				expected++;
			}
		}
	}

	public async listVersions(): Promise<ResolvedVersion[]> {
		const versions = await this.getVersions();
		// Resolution order does not matter here, so resolve concurrently; the newest-first array order is
		// preserved by Promise.all regardless of completion order.
		return Promise.all(
			versions.map(async (version) => ({
				...version,
				sequenceNumber: await this.resolveSeq(version.versionId),
			})),
		);
	}

	private async getVersions(): Promise<OdspFileVersionRef[]> {
		// Cache the pending promise, not the awaited value, so concurrent callers share one fetch and a
		// refresh() that runs while the fetch is in flight is not overwritten when the fetch settles.
		this.versionsCache ??= this.fetcher.listFileVersions();
		return this.versionsCache;
	}

	private async resolveSeq(versionId: string): Promise<number> {
		// Cache the pending promise (a version's sequence number never changes) so concurrent callers
		// coalesce and a refresh() is not clobbered by a fetch that was already in flight.
		let pending = this.seqByVersion.get(versionId);
		if (pending === undefined) {
			pending = this.fetcher.resolveSequenceNumber(versionId);
			this.seqByVersion.set(versionId, pending);
		}
		return pending;
	}
}

/**
 * Create an {@link IOdspVersionManager} for a specific ODSP file, wired to the real ODSP REST APIs.
 */
export function createOdspVersionManager(
	props: OdspFileVersionFetcherProps,
): IOdspVersionManager {
	return new OdspVersionManager(createOdspFileVersionFetcher(props), props.logger);
}
