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
	/**
	 * Size in bytes of this version's content.
	 */
	readonly sizeBytes: number;
}

/**
 * An ODSP file version together with its resolved Fluid sequence number.
 */
export interface ResolvedVersion extends OdspFileVersionRef {
	/**
	 * The Fluid sequence number the version's snapshot represents.
	 */
	readonly sequenceNumber: number;
	/**
	 * The collaboration-window floor at this version, if read. Not used for selection.
	 */
	readonly minimumSequenceNumber?: number;
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
 * {@link OdspVersionManager} so the selection logic does not depend on how versions are fetched.
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
	/**
	 * Return every version with its resolved sequence number, newest-first.
	 */
	listVersions(): Promise<ResolvedVersion[]>;
	/**
	 * Drop cached version enumeration and resolved sequence numbers so the next query re-fetches.
	 */
	refresh(): void;
}

/**
 * Default {@link IOdspVersionManager}. Caches the version list and resolved sequence numbers. The
 * resolution strategy (eager, newest-to-oldest, stopping at the first usable base) is hidden behind
 * {@link findBaseForSeq} and can change without affecting callers.
 */
export class OdspVersionManager implements IOdspVersionManager {
	private versionsCache: OdspFileVersionRef[] | undefined;
	private readonly seqByVersion = new Map<string, number>();

	public constructor(private readonly fetcher: IOdspFileVersionFetcher) {}

	public refresh(): void {
		this.versionsCache = undefined;
		this.seqByVersion.clear();
	}

	public async findBaseForSeq(target: number): Promise<BaseForSeq> {
		// Recoverable base candidates = every version except the tip (index 0 ≈ the live document).
		const versions = await this.getVersions();
		const candidates = versions.slice(1);

		// The list is newest-first (descending sequence number), so the first candidate whose seq is
		// at or before the target is the greatest seq <= target — that is the closest base. Scanning
		// this way also yields the newest of any versions that share a sequence number (dedup), and
		// avoids resolving older versions than necessary.
		let oldestResolvedSeq: number | undefined;
		for (const version of candidates) {
			const sequenceNumber = await this.resolveSeq(version.versionId);
			oldestResolvedSeq = sequenceNumber;
			if (sequenceNumber <= target) {
				return { kind: "found", base: { ...version, sequenceNumber } };
			}
		}
		return { kind: "noBaseVersion", oldestResolvedSeq };
	}

	public async listVersions(): Promise<ResolvedVersion[]> {
		const versions = await this.getVersions();
		const resolved: ResolvedVersion[] = [];
		for (const version of versions) {
			resolved.push({ ...version, sequenceNumber: await this.resolveSeq(version.versionId) });
		}
		return resolved;
	}

	private async getVersions(): Promise<OdspFileVersionRef[]> {
		this.versionsCache ??= await this.fetcher.listFileVersions();
		return this.versionsCache;
	}

	private async resolveSeq(versionId: string): Promise<number> {
		const cached = this.seqByVersion.get(versionId);
		if (cached !== undefined) {
			return cached;
		}
		const sequenceNumber = await this.fetcher.resolveSequenceNumber(versionId);
		this.seqByVersion.set(versionId, sequenceNumber);
		return sequenceNumber;
	}
}
