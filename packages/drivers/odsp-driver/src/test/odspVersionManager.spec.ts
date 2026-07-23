/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

/* eslint-disable import-x/no-internal-modules */
import {
	OdspVersionManager,
	type OdspFileVersionRef,
	type IOdspFileVersionFetcher,
} from "../odspVersionManager/odspVersionManager.js";
/* eslint-enable import-x/no-internal-modules */

/**
 * Build an {@link OdspFileVersionRef} with the given label. Timestamp/size are irrelevant to the
 * manager's selection logic, so they are fixed.
 */
function ref(versionId: string): OdspFileVersionRef {
	return { versionId, lastModifiedDateTime: "2026-01-01T00:00:00.000Z" };
}

interface FakeFetcher extends IOdspFileVersionFetcher {
	/** Number of times the version list was fetched. */
	readonly listCalls: () => number;
	/** Version ids passed to resolveSequenceNumber, in call order. */
	readonly resolvedIds: () => string[];
}

/*
 * Create a manager backed by in-memory fakes so the selection logic can be tested without ODSP.
 * `versions` is the newest-first list the fake `listFileVersions` returns; `seqByVersion` maps a
 * versionId to the sequence number the fake `resolveSequenceNumber` returns (a missing id makes it
 * throw, modelling a parse failure).
 */
function makeManager(
	versions: OdspFileVersionRef[],
	seqByVersion: Record<string, number>,
): { manager: OdspVersionManager; fetcher: FakeFetcher } {
	let listCallCount = 0;
	const resolved: string[] = [];
	const fetcher: FakeFetcher = {
		listFileVersions: async () => {
			listCallCount++;
			return versions;
		},
		resolveSequenceNumber: async (versionId: string) => {
			resolved.push(versionId);
			const seq: number | undefined = seqByVersion[versionId];
			if (seq === undefined) {
				throw new Error(`no sequence number configured for version ${versionId}`);
			}
			return seq;
		},
		listCalls: () => listCallCount,
		resolvedIds: () => [...resolved],
	};
	return { manager: new OdspVersionManager(fetcher), fetcher };
}

describe("OdspVersionManager", () => {
	describe("findBaseForSeq: which version does it pick for a target sequence number?", () => {
		// Timeline (newest-first): 44.0 is the tip (excluded); sealed: 43.0=460, 42.0=448, 40.0=418.
		// The tip's sequence number is intentionally left unconfigured, so any attempt to resolve it
		// would throw — proving the tip is never resolved.
		const versions = [ref("44.0"), ref("43.0"), ref("42.0"), ref("40.0")];
		const seqs = { "43.0": 460, "42.0": 448, "40.0": 418 };

		it("returns the closest sealed version at or before the target (target between two versions)", async () => {
			// @q M-SELECT-01
			const { manager } = makeManager(versions, seqs);
			const result = await manager.findBaseForSeq(430);
			assert.equal(result.kind, "found");
			assert.equal(result.kind === "found" && result.base.versionId, "40.0");
			assert.equal(result.kind === "found" && result.base.sequenceNumber, 418);
		});

		it("returns an exact match (0-op replay) when the target equals a version's sequence number", async () => {
			// @q M-SELECT-02
			const { manager } = makeManager(versions, seqs);
			const result = await manager.findBaseForSeq(448);
			assert.equal(result.kind, "found");
			assert.equal(result.kind === "found" && result.base.versionId, "42.0");
			assert.equal(result.kind === "found" && result.base.sequenceNumber, 448);
		});

		it("returns the newest SEALED version when the target is newer than all sealed versions (not the tip)", async () => {
			// @q M-SELECT-03
			const { manager, fetcher } = makeManager(versions, seqs);
			const result = await manager.findBaseForSeq(500);
			assert.equal(result.kind, "found");
			// 43.0, not the tip 44.0 — the tip is excluded from base selection.
			assert.equal(result.kind === "found" && result.base.versionId, "43.0");
			assert.equal(result.kind === "found" && result.base.sequenceNumber, 460);
			assert.ok(!fetcher.resolvedIds().includes("44.0"), "the tip must never be resolved");
		});

		it("returns noBaseVersion (with the oldest resolved seq) when the target predates all versions", async () => {
			// @q M-SELECT-04
			const { manager } = makeManager(versions, seqs);
			const result = await manager.findBaseForSeq(400);
			assert.equal(result.kind, "noBaseVersion");
			assert.equal(result.kind === "noBaseVersion" && result.oldestResolvedSeq, 418);
		});
	});

	describe("findBaseForSeq: the tip, dedup, and empty history", () => {
		it("never treats the tip as a base — the tip's sequence number is never resolved", async () => {
			// @q M-TIP-01
			// The tip 44.0 has no configured sequence number, so resolving it would throw. A successful
			// result therefore proves the tip was skipped.
			const { manager, fetcher } = makeManager([ref("44.0"), ref("43.0"), ref("42.0")], {
				"43.0": 460,
				"42.0": 448,
			});
			const result = await manager.findBaseForSeq(500);
			assert.equal(result.kind, "found");
			assert.equal(result.kind === "found" && result.base.versionId, "43.0");
			assert.deepEqual(
				fetcher.resolvedIds(),
				["43.0"],
				"only the newest sealed version is resolved; the tip is not",
			);
		});

		it("returns noBaseVersion when the only version is the tip", async () => {
			// @q M-TIP-02
			const { manager, fetcher } = makeManager([ref("44.0")], {});
			const result = await manager.findBaseForSeq(500);
			assert.equal(result.kind, "noBaseVersion");
			assert.deepEqual(fetcher.resolvedIds(), [], "the tip must never be resolved");
		});

		it("returns the newest of sealed versions sharing a sequence number (dedup)", async () => {
			// @q M-DEDUP-01
			// Two sealed versions share seq 448 (a metadata-only re-snap); newest is 42.0.
			const versions = [ref("44.0"), ref("43.0"), ref("42.0"), ref("41.5"), ref("40.0")];
			const seqs = { "43.0": 460, "42.0": 448, "41.5": 448, "40.0": 418 };
			const { manager } = makeManager(versions, seqs);
			const result = await manager.findBaseForSeq(448);
			assert.equal(result.kind, "found");
			assert.equal(result.kind === "found" && result.base.versionId, "42.0");
		});

		it("returns noBaseVersion when the version list is empty", async () => {
			// @q M-EMPTY-01
			const { manager } = makeManager([], {});
			const result = await manager.findBaseForSeq(100);
			assert.equal(result.kind, "noBaseVersion");
		});
	});

	describe("efficiency: does it avoid unnecessary work?", () => {
		it("stops resolving once it finds the closest base (does not resolve older versions or the tip)", async () => {
			// @q M-STOP-01
			const versions = [ref("44.0"), ref("43.0"), ref("42.0"), ref("40.0")];
			const seqs = { "43.0": 460, "42.0": 448, "40.0": 418 };
			const { manager, fetcher } = makeManager(versions, seqs);
			// target 448: skips the tip, resolves 43.0 (too new) then 42.0 (match), so 40.0 is never resolved.
			await manager.findBaseForSeq(448);
			assert.deepEqual(fetcher.resolvedIds(), ["43.0", "42.0"]);
		});

		it("caches resolved sequence numbers across calls but re-enumerates the list each call", async () => {
			// @q M-CACHE-01
			const versions = [ref("44.0"), ref("43.0"), ref("42.0"), ref("40.0")];
			const seqs = { "43.0": 460, "42.0": 448, "40.0": 418 };
			const { manager, fetcher } = makeManager(versions, seqs);
			await manager.findBaseForSeq(0); // scans all sealed (no match), resolving 43.0, 42.0, 40.0
			await manager.findBaseForSeq(0); // list re-fetched; seqs served from cache
			assert.equal(fetcher.listCalls(), 2, "the version list is re-enumerated on every call");
			assert.deepEqual(
				fetcher.resolvedIds(),
				["43.0", "42.0", "40.0"],
				"each sealed version's sequence number is resolved at most once (cached)",
			);
		});

		it("prunes the resolved sequence number of a version that leaves the list, re-resolving it if it returns", async () => {
			// @q M-CACHE-03
			const versions = [ref("44.0"), ref("43.0"), ref("42.0"), ref("40.0")];
			const seqs = { "43.0": 460, "42.0": 448, "40.0": 418 };
			const { manager, fetcher } = makeManager(versions, seqs);
			await manager.findBaseForSeq(0); // resolves 43.0, 42.0, 40.0

			versions.pop(); // 40.0 leaves the list
			await manager.findBaseForSeq(0); // re-enumerates; 43.0/42.0 kept, 40.0 pruned (and now absent)

			versions.push(ref("40.0")); // 40.0 returns
			await manager.findBaseForSeq(0); // 40.0 must be resolved again, not served stale

			assert.equal(fetcher.listCalls(), 3, "the list is re-enumerated on every call");
			assert.deepEqual(
				fetcher.resolvedIds(),
				["43.0", "42.0", "40.0", "40.0"],
				"survivors stay cached; a departed-then-returned version is re-resolved",
			);
		});

		it("does not memoize a failed version-list fetch — a later call retries", async () => {
			// @q M-CACHE-04
			let listCalls = 0;
			const fetcher: IOdspFileVersionFetcher = {
				listFileVersions: async () => {
					listCalls++;
					if (listCalls === 1) {
						throw new Error("transient list failure");
					}
					return [ref("44.0"), ref("43.0")];
				},
				resolveSequenceNumber: async (versionId: string) => Number.parseInt(versionId, 10),
			};
			const manager = new OdspVersionManager(fetcher);
			await assert.rejects(async () => manager.findBaseForSeq(0), /transient list failure/);
			const result = await manager.findBaseForSeq(0); // retries the list, succeeds
			assert.equal(result.kind, "noBaseVersion");
			assert.equal(
				listCalls,
				2,
				"the failed list fetch should be retried, not replayed from cache",
			);
		});
	});

	describe("error handling", () => {
		it("propagates (does not swallow) a failure to resolve a version's sequence number", async () => {
			// @q M-ERR-01
			// 42.0 has no configured seq -> resolveSequenceNumber throws.
			const versions = [ref("44.0"), ref("43.0"), ref("42.0"), ref("40.0")];
			const seqs = { "43.0": 460, "40.0": 418 };
			const { manager } = makeManager(versions, seqs);
			await assert.rejects(async () => manager.findBaseForSeq(430), /42\.0/);
		});

		it("does not cache a failed resolution — a later call retries", async () => {
			// @q M-ERR-02
			let attempts = 0;
			const fetcher: IOdspFileVersionFetcher = {
				listFileVersions: async () => [ref("44.0"), ref("43.0")],
				resolveSequenceNumber: async () => {
					attempts++;
					if (attempts === 1) {
						throw new Error("transient");
					}
					return 448;
				},
			};
			const manager = new OdspVersionManager(fetcher);
			await assert.rejects(async () => manager.findBaseForSeq(500), /transient/);
			// The rejected resolution must not be cached: the next call retries and succeeds.
			const result = await manager.findBaseForSeq(500);
			assert.equal(result.kind === "found" && result.base.sequenceNumber, 448);
			assert.equal(
				attempts,
				2,
				"the failed resolution should be retried, not replayed from cache",
			);
		});
	});

	describe("listVersions", () => {
		it("returns every version with its resolved sequence number, newest-first", async () => {
			// @q M-LIST-01
			const versions = [ref("44.0"), ref("43.0"), ref("42.0"), ref("40.0")];
			const seqs = { "44.0": 480, "43.0": 460, "42.0": 448, "40.0": 418 };
			const { manager } = makeManager(versions, seqs);
			const resolved = await manager.listVersions();
			assert.deepEqual(
				resolved.map((v) => [v.versionId, v.sequenceNumber]),
				[
					["44.0", 480],
					["43.0", 460],
					["42.0", 448],
					["40.0", 418],
				],
			);
		});

		it("resolves the tip fresh on each call (never cached) while sealed versions come from cache", async () => {
			// @q M-LIST-02
			const versions = [ref("44.0"), ref("43.0"), ref("42.0")];
			const seqs = { "44.0": 480, "43.0": 460, "42.0": 448 };
			const { manager, fetcher } = makeManager(versions, seqs);
			await manager.listVersions();
			await manager.listVersions();
			const resolved = fetcher.resolvedIds();
			assert.equal(
				resolved.filter((id) => id === "44.0").length,
				2,
				"the tip is resolved fresh on every call",
			);
			assert.equal(
				resolved.filter((id) => id === "43.0").length,
				1,
				"a sealed version is resolved once and cached",
			);
			assert.equal(resolved.filter((id) => id === "42.0").length, 1);
		});
	});
});
