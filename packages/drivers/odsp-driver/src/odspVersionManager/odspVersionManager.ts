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

import { PromiseCache } from "@fluidframework/core-utils/internal";
import { NonRetryableError } from "@fluidframework/driver-utils/internal";
import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";

import { pkgVersion as driverVersion } from "../packageVersion.js";

import {
	createOdspFileVersionFetcher,
	type OdspFileVersionFetcherProps,
	type OdspFileVersionRef,
	type IOdspFileVersionFetcher,
} from "./odspFileVersionFetcher.js";

// Re-exported so consumers (and this module's own index) can keep importing these fetcher-owned
// types from the version manager. The definitions live in odspFileVersionFetcher.ts so that file
// does not depend on this one, avoiding a circular dependency between the two modules.
export type { OdspFileVersionRef, IOdspFileVersionFetcher } from "./odspFileVersionFetcher.js";

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
 * The tip (newest) version is excluded from base selection, so when the target is at or after the head
 * the base is the newest *sealed* version with `seq <= target` (a normal `found`); if the file's only
 * version is the tip, the result is `noBaseVersion`. The wired consumer surfaces `noBaseVersion` as a
 * `UsageError`; loading the live file for a near-head target is a possible future consumer choice, not
 * current behavior.
 */
export type BaseForSeq =
	| {
			/** A recoverable version with `sequenceNumber <= target` was found. */
			readonly kind: "found";
			readonly base: ResolvedVersion;
	  }
	| {
			/**
			 * No sealed version has `sequenceNumber <= target` — the target predates retained history, or
			 * the only version is the excluded tip.
			 */
			readonly kind: "noBaseVersion";
			/** The oldest sequence number that was resolved while searching, if any. */
			readonly oldestResolvedSeq?: number;
	  };

/**
 * Selects the file version to use as the base for loading or replaying to a target sequence number.
 */
export interface IOdspVersionManager {
	/**
	 * Given a target sequence number, return the closest version at or before it (`found`), or
	 * `noBaseVersion` if the target predates the oldest retained version.
	 *
	 * @remarks
	 * A `found` base is guaranteed to share the live document's ODSP epoch (lineage): before returning
	 * it, the chosen base's epoch is compared with the live document's, and a mismatch throws a non-retryable error
	 * rather than returning a base that cannot be replayed. Op availability is enforced separately and
	 * lazily as the loader reads the bridging ops.
	 */
	findBaseForSeq(target: number): Promise<BaseForSeq>;
}

/**
 * Default {@link IOdspVersionManager}. Caches resolved sequence numbers (which never change); the version
 * list is re-enumerated on each query rather than cached, since new versions are cut over time. The
 * resolution strategy (eager, newest-to-oldest, stopping at the first usable base) is hidden behind
 * {@link findBaseForSeq} and can change without affecting callers.
 */
// Exported only so the same-package tests can construct it with a fake IOdspFileVersionFetcher.
// Deliberately kept out of the folder barrel and the package public index, so it is not public API.
export class OdspVersionManager implements IOdspVersionManager {
	// Sealed versions' sequence numbers, memoized so each is resolved at most once per manager instance
	// (a sealed version's number is fixed once the version exists).
	private readonly seqCache = new PromiseCache<string, number>();
	// Sealed versions' ODSP epochs, memoized like their sequence numbers. The live document's epoch is NOT
	// cached — it can change (restore/reupload), so validateLineageEpoch always reads it fresh.
	private readonly epochCache = new PromiseCache<string, string | undefined>();

	public constructor(private readonly fetcher: IOdspFileVersionFetcher) {}

	public async findBaseForSeq(target: number): Promise<BaseForSeq> {
		// Re-enumerate the list each call (it changes as new versions are cut).
		const versions = await this.fetcher.listFileVersions();

		// Start past the tip (index 0): the newest version's sequence number can still advance until a newer
		// version is cut, so it is treated as the live head rather than a stable base. Scan the remaining
		// (sealed) versions newest-first and return the first with sequence number <= target — the closest
		// base — or noBaseVersion, reporting the oldest sequence number seen.
		const candidates = versions.slice(1);

		let oldestResolvedSeq: number | undefined;
		for (const version of candidates) {
			const sequenceNumber = await this.resolveSeq(version.versionId);
			oldestResolvedSeq =
				oldestResolvedSeq === undefined
					? sequenceNumber
					: Math.min(oldestResolvedSeq, sequenceNumber);
			if (sequenceNumber <= target) {
				const base = { ...version, sequenceNumber };
				// Confirm the chosen base shares the live document's lineage before handing it back
				await this.validateLineageEpoch(base);
				return { kind: "found", base };
			}
		}
		return { kind: "noBaseVersion", oldestResolvedSeq };
	}

	private async validateLineageEpoch(base: ResolvedVersion): Promise<void> {
		// The live document's epoch can change (a restore or download-and-reupload bumps it), so it is
		// always read fresh. A numbered version's snapshot is immutable, so its epoch never changes and
		// is cached per versionId (see resolveVersionEpoch).
		const [liveEpoch, baseEpoch] = await Promise.all([
			this.fetcher.getLiveDocumentEpoch(),
			this.resolveVersionEpoch(base.versionId),
		]);
		if (liveEpoch === undefined || baseEpoch === undefined) {
			throw new NonRetryableError(
				`Cannot verify that ODSP file version ${base.versionId} shares the live document's ` +
					`lineage: the storage response is missing an epoch (base epoch: ${baseEpoch ?? "unknown"}, ` +
					`live epoch: ${liveEpoch ?? "unknown"}).`,
				OdspErrorTypes.incorrectServerResponse,
				{
					driverVersion,
					serverEpoch: liveEpoch,
					clientEpoch: baseEpoch,
				},
			);
		}
		if (liveEpoch !== baseEpoch) {
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

	public async listVersions(): Promise<ResolvedVersion[]> {
		const versions = await this.fetcher.listFileVersions();
		// Resolution order does not matter, so resolve concurrently; the newest-first array order is
		// preserved by Promise.all regardless of completion order.
		return Promise.all(
			versions.map(async (version, index) => ({
				...version,
				// Resolve the tip (index 0) fresh each call, since its sequence number can still change;
				// sealed versions come from the cache.
				sequenceNumber:
					index === 0
						? await this.fetcher.resolveSequenceNumber(version.versionId)
						: await this.resolveSeq(version.versionId),
			})),
		);
	}

	private async resolveSeq(versionId: string): Promise<number> {
		// Cached indefinitely (a sealed version's number is fixed); concurrent calls coalesce and a failed
		// resolution is evicted so a later call retries.
		return this.seqCache.addOrGet(versionId, async () =>
			this.fetcher.resolveSequenceNumber(versionId),
		);
	}

	private async resolveVersionEpoch(versionId: string): Promise<string | undefined> {
		// Cached like resolveSeq (a sealed version's epoch is fixed). The live document's epoch is read
		// fresh instead (see validateLineageEpoch).
		return this.epochCache.addOrGet(versionId, async () =>
			this.fetcher.getRecoverableVersionEpoch(versionId),
		);
	}
}

/**
 * Create an {@link IOdspVersionManager} for a specific ODSP file, wired to the real ODSP REST APIs.
 */
export function createOdspVersionManager(
	props: OdspFileVersionFetcherProps,
): IOdspVersionManager {
	return new OdspVersionManager(createOdspFileVersionFetcher(props));
}
