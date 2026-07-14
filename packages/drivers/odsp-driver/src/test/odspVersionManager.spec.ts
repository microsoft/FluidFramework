/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	OdspVersionManager,
	type OdspFileVersionRef,
	type IOdspFileVersionFetcher,
} from "../odspVersionManager/index.js";

/**
 * Build an {@link OdspFileVersionRef} with the given label. Timestamp/size are irrelevant to the
 * manager's selection logic, so they are fixed.
 */
function ref(versionId: string): OdspFileVersionRef {
	return { versionId, lastModifiedDateTime: "2026-01-01T00:00:00.000Z", sizeBytes: 1000 };
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
		// Timeline (newest-first): tip=460, then recoverable versions 448 and 418.
		const versions = [ref("tip"), ref("42.0"), ref("40.0")];
		const seqs = { tip: 460, "42.0": 448, "40.0": 418 };

		it("returns the closest version at or before the target (target between two versions)", async () => {
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

		it("returns the newest recoverable version when the target is newer than all versions", async () => {
			// @q M-SELECT-03
			const { manager } = makeManager(versions, seqs);
			const result = await manager.findBaseForSeq(500);
			assert.equal(result.kind, "found");
			assert.equal(result.kind === "found" && result.base.versionId, "42.0");
			assert.equal(result.kind === "found" && result.base.sequenceNumber, 448);
		});

		it("returns noBaseVersion (with the oldest resolved seq) when the target predates all versions", async () => {
			// @q M-SELECT-04
			const { manager } = makeManager(versions, seqs);
			const result = await manager.findBaseForSeq(400);
			assert.equal(result.kind, "noBaseVersion");
			assert.equal(result.kind === "noBaseVersion" && result.oldestResolvedSeq, 418);
		});
	});

	describe("findBaseForSeq: dedup and the tip", () => {
		it("returns the newest of versions sharing a sequence number (dedup)", async () => {
			// @q M-DEDUP-01
			// Two recoverable versions share seq 448 (a metadata-only re-snap); newest is 42.0.
			const versions = [ref("tip"), ref("42.0"), ref("41.5"), ref("40.0")];
			const seqs = { tip: 460, "42.0": 448, "41.5": 448, "40.0": 418 };
			const { manager } = makeManager(versions, seqs);
			const result = await manager.findBaseForSeq(448);
			assert.equal(result.kind, "found");
			assert.equal(result.kind === "found" && result.base.versionId, "42.0");
		});

		it("never treats the tip (index 0) as a recoverable base", async () => {
			// @q M-TIP-01
			const versions = [ref("tip"), ref("42.0"), ref("40.0")];
			const seqs = { tip: 460, "42.0": 448, "40.0": 418 };
			const { manager, fetcher } = makeManager(versions, seqs);
			await manager.findBaseForSeq(500);
			assert.ok(
				!fetcher.resolvedIds().includes("tip"),
				"the tip's sequence number should never be resolved",
			);
		});

		it("returns noBaseVersion when only the tip exists", async () => {
			// @q M-TIP-02
			const { manager } = makeManager([ref("tip")], { tip: 460 });
			const result = await manager.findBaseForSeq(100);
			assert.equal(result.kind, "noBaseVersion");
		});

		it("returns noBaseVersion when the version list is empty", async () => {
			// @q M-EMPTY-01
			const { manager } = makeManager([], {});
			const result = await manager.findBaseForSeq(100);
			assert.equal(result.kind, "noBaseVersion");
		});
	});

	describe("efficiency: does it avoid unnecessary work?", () => {
		it("stops resolving once it finds the closest base (does not resolve older versions)", async () => {
			// @q M-STOP-01
			const versions = [ref("tip"), ref("42.0"), ref("40.0")];
			const seqs = { tip: 460, "42.0": 448, "40.0": 418 };
			const { manager, fetcher } = makeManager(versions, seqs);
			// target 448 matches 42.0, so 40.0 should never be resolved.
			await manager.findBaseForSeq(448);
			assert.deepEqual(fetcher.resolvedIds(), ["42.0"]);
		});

		it("caches the version list and resolved sequence numbers across calls", async () => {
			// @q M-CACHE-01
			const versions = [ref("tip"), ref("42.0"), ref("40.0")];
			const seqs = { tip: 460, "42.0": 448, "40.0": 418 };
			const { manager, fetcher } = makeManager(versions, seqs);
			await manager.findBaseForSeq(430); // resolves 42.0 then 40.0
			await manager.findBaseForSeq(430); // should hit caches only
			assert.equal(fetcher.listCalls(), 1, "version list should be fetched once");
			assert.deepEqual(
				fetcher.resolvedIds(),
				["42.0", "40.0"],
				"each version should be resolved at most once",
			);
		});

		it("re-enumerates after refresh()", async () => {
			// @q M-CACHE-02
			const versions = [ref("tip"), ref("42.0"), ref("40.0")];
			const seqs = { tip: 460, "42.0": 448, "40.0": 418 };
			const { manager, fetcher } = makeManager(versions, seqs);
			await manager.findBaseForSeq(430);
			manager.refresh();
			await manager.findBaseForSeq(430);
			assert.equal(fetcher.listCalls(), 2, "refresh should force a re-enumeration");
		});
	});

	describe("error handling", () => {
		it("propagates (does not swallow) a failure to resolve a version's sequence number", async () => {
			// @q M-ERR-01
			// 42.0 has no configured seq -> resolveSequenceNumber throws.
			const versions = [ref("tip"), ref("42.0"), ref("40.0")];
			const seqs = { tip: 460, "40.0": 418 };
			const { manager } = makeManager(versions, seqs);
			await assert.rejects(async () => manager.findBaseForSeq(430), /42\.0/);
		});
	});

	describe("listVersions", () => {
		it("returns every version with its resolved sequence number, newest-first", async () => {
			// @q M-LIST-01
			const versions = [ref("tip"), ref("42.0"), ref("40.0")];
			const seqs = { tip: 460, "42.0": 448, "40.0": 418 };
			const { manager } = makeManager(versions, seqs);
			const resolved = await manager.listVersions();
			assert.deepEqual(
				resolved.map((v) => [v.versionId, v.sequenceNumber]),
				[
					["tip", 460],
					["42.0", 448],
					["40.0", 418],
				],
			);
		});
	});
});
