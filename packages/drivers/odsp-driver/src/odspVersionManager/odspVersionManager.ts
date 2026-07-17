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
 * The tip (newest) version is excluded from base selection, so when the target is at or after the head
 * the base is the newest *sealed* version with `seq <= target` (a normal `found`); if the file's only
 * version is the tip, the result is `noBaseVersion` and a consumer loads the live file instead.
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
}

/**
 * Default {@link IOdspVersionManager}. Caches resolved sequence numbers (which never change); the version
 * list is re-enumerated on each query rather than cached, since new versions are cut over time. The
 * resolution strategy (eager, newest-to-oldest, stopping at the first usable base) is hidden behind
 * {@link findBaseForSeq} and can change without affecting callers.
 */
export class OdspVersionManager implements IOdspVersionManager {
	// Caches each sealed version's sequence number, which is fixed once the version exists, so it is
	// reused indefinitely. The version list is re-enumerated per query (see getVersions) and the tip's
	// number is resolved fresh each time (see findBaseForSeq), since both change as new versions are cut.
	private readonly seqCache = new PromiseCache<string, number>();
	// versionIds from the previous enumeration, used to prune seqCache of versions that have left the list.
	private lastKnownVersionIds: readonly string[] = [];

	public constructor(private readonly fetcher: IOdspFileVersionFetcher) {}

	public async findBaseForSeq(target: number): Promise<BaseForSeq> {
		const versions = await this.getVersions();

		// Start past the tip (index 0): the newest version's sequence number can still advance until a newer
		// version is cut, so it is treated as the live head rather than a stable base. Scan the remaining
		// (sealed) versions newest-first and return the first with sequence number <= target — the closest
		// base — or noBaseVersion, reporting the oldest sequence number seen.
		let oldestResolvedSeq: number | undefined;
		for (let index = 1; index < versions.length; index++) {
			const version = versions[index];
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

	public async listVersions(): Promise<ResolvedVersion[]> {
		const versions = await this.getVersions();
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

	private async getVersions(): Promise<OdspFileVersionRef[]> {
		// Re-enumerate the version list on every call: it changes as new versions are cut, so a cached copy
		// would go stale. After fetching, prune cached sequence numbers for versions that have left the list
		// (a sealed version's number never changes, so survivors are kept).
		const versions = await this.fetcher.listFileVersions();
		const live = new Set(versions.map((version) => version.versionId));
		for (const versionId of this.lastKnownVersionIds) {
			if (!live.has(versionId)) {
				this.seqCache.remove(versionId);
			}
		}
		this.lastKnownVersionIds = versions.map((version) => version.versionId);
		return versions;
	}

	private async resolveSeq(versionId: string): Promise<number> {
		// PromiseCache returns a cached value indefinitely (a sealed version's number is fixed) and
		// coalesces concurrent resolutions, so a number is fetched once and reused. A failed resolution is
		// evicted, so a later call retries it.
		return this.seqCache.addOrGet(versionId, async () =>
			this.fetcher.resolveSequenceNumber(versionId),
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
