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

import { assert, PromiseCache } from "@fluidframework/core-utils/internal";
import type { ISnapshot } from "@fluidframework/driver-definitions/internal";
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

type ResolvedVersionData = {
	readonly snapshot: ISnapshot & { readonly sequenceNumber: number };
	readonly epoch: string | undefined;
};

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
			/** The already-fetched base snapshot, reused by the point-in-time load. */
			readonly snapshot: ISnapshot;
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
 * Default {@link IOdspVersionManager}. Caches resolved sealed-version snapshots (which never change);
 * the version list is re-enumerated on each query rather than cached, since new versions are cut. The
 * resolution strategy is hidden behind {@link findBaseForSeq} and can change without affecting
 * callers.
 */
// Exported only so the same-package tests can construct it with a fake IOdspFileVersionFetcher.
// Deliberately kept out of the folder barrel and the package public index, so it is not public API.
export class OdspVersionManager implements IOdspVersionManager {
	// Sealed versions' snapshots and epochs, memoized so each is fetched at most once per manager
	// instance (a sealed version is immutable once it exists).
	private readonly versionCache = new PromiseCache<string, ResolvedVersionData>();

	public constructor(private readonly fetcher: IOdspFileVersionFetcher) {}

	public async findBaseForSeq(target: number): Promise<BaseForSeq> {
		// Re-enumerate the list each call (it changes as new versions are cut).
		const versions = await this.fetcher.listFileVersions();

		// Start past the tip (index 0): the newest version's sequence number can still advance until a newer
		// version is cut, so it is treated as the live head rather than a stable base.
		const candidates = versions.slice(1);
		if (candidates.length === 0) {
			return { kind: "noBaseVersion" };
		}

		const resolveCandidate = async (index: number) => {
			const version = candidates[index];
			assert(version !== undefined, "Point-in-time version candidate index is out of bounds");
			return {
				version,
				resolved: await this.resolveVersion(version.versionId),
			};
		};

		// Most point-in-time targets are expected to be near the head. Probe 0, 1, 3, 7, ... so a
		// near-head target still costs one request, while a deep target establishes a logarithmic search
		// interval instead of downloading every newer snapshot.
		let lastTooNewIndex = -1;
		let probeIndex = 0;
		let upperBound:
			| {
					readonly index: number;
					readonly version: OdspFileVersionRef;
					readonly resolved: ResolvedVersionData;
			  }
			| undefined;
		while (probeIndex < candidates.length) {
			const candidate = await resolveCandidate(probeIndex);
			if (candidate.resolved.snapshot.sequenceNumber <= target) {
				upperBound = { index: probeIndex, ...candidate };
				break;
			}
			lastTooNewIndex = probeIndex;
			if (probeIndex === candidates.length - 1) {
				break;
			}
			probeIndex = Math.min(candidates.length - 1, probeIndex * 2 + 1);
		}

		if (upperBound === undefined) {
			// A monotonic history has no usable base. Fall back to the full scan before reporting
			// noBaseVersion so a rare ordering inversion cannot hide an older valid snapshot.
			let oldestResolvedSeq: number | undefined;
			for (let index = 0; index < candidates.length; index++) {
				const candidate = await resolveCandidate(index);
				const { sequenceNumber } = candidate.resolved.snapshot;
				oldestResolvedSeq =
					oldestResolvedSeq === undefined
						? sequenceNumber
						: Math.min(oldestResolvedSeq, sequenceNumber);
				if (sequenceNumber <= target) {
					const base = { ...candidate.version, sequenceNumber };
					await this.validateLineageEpoch(base, candidate.resolved.epoch);
					return { kind: "found", base, snapshot: candidate.resolved.snapshot };
				}
			}
			return { kind: "noBaseVersion", oldestResolvedSeq };
		}

		// Find the newest version at or before the target inside the bracket established above.
		let low = lastTooNewIndex + 1;
		let high = upperBound.index;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			const candidate = await resolveCandidate(middle);
			if (candidate.resolved.snapshot.sequenceNumber <= target) {
				high = middle;
			} else {
				low = middle + 1;
			}
		}

		const selected = await resolveCandidate(low);
		const sequenceNumber = selected.resolved.snapshot.sequenceNumber;
		const base = { ...selected.version, sequenceNumber };
		// Confirm the chosen base shares the live document's lineage before handing it back.
		await this.validateLineageEpoch(base, selected.resolved.epoch);
		return { kind: "found", base, snapshot: selected.resolved.snapshot };
	}

	private async validateLineageEpoch(
		base: ResolvedVersion,
		baseEpoch: string | undefined,
	): Promise<void> {
		// The base epoch comes from the same immutable snapshot response used to resolve its sequence
		// number. Only the live epoch needs another request, and it is always read fresh because a
		// restore or download-and-reupload can change it.
		const liveEpoch = await this.fetcher.getLiveDocumentEpoch();
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
						? (await this.fetcher.resolveVersion(version.versionId)).snapshot.sequenceNumber
						: (await this.resolveVersion(version.versionId)).snapshot.sequenceNumber,
			})),
		);
	}

	private async resolveVersion(versionId: string): Promise<ResolvedVersionData> {
		// A sealed version's snapshot and epoch are immutable. Concurrent calls coalesce, and a failed
		// resolution is evicted so a later call retries.
		return this.versionCache.addOrGet(versionId, async () =>
			this.fetcher.resolveVersion(versionId),
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
