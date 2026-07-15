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
 * Default {@link IOdspVersionManager}. Caches the version list and resolved sequence numbers. The
 * resolution strategy (eager, newest-to-oldest, stopping at the first usable base) is hidden behind
 * {@link findBaseForSeq} and can change without affecting callers.
 */
export class OdspVersionManager implements IOdspVersionManager {
	private versionsCache: Promise<OdspFileVersionRef[]> | undefined;
	private readonly seqByVersion = new Map<string, Promise<number>>();

	public constructor(private readonly fetcher: IOdspFileVersionFetcher) {}

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
	return new OdspVersionManager(createOdspFileVersionFetcher(props));
}
