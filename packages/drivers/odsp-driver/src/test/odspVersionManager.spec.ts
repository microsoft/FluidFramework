/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";
import { MockLogger, createChildLogger } from "@fluidframework/telemetry-utils/internal";

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
	/** (from, to) pairs passed to fetchOps, in call order. */
	readonly opsCalls: () => [number, number][];
}

/**
 * Optional epoch/ops behavior for {@link makeManager}, used by the `validateBaseForReplay` tests.
 * `liveEpoch`/`versionEpochs` back the epoch getters; `retainedOps` is the ascending set of sequence
 * numbers the fake server still retains, which `fetchOps` filters by the requested [from, to) range.
 */
interface ReplayConfig {
	readonly liveEpoch?: string;
	readonly versionEpochs?: Record<string, string | undefined>;
	readonly retainedOps?: number[];
}

/*
 * Create a manager backed by in-memory fakes so the selection logic can be tested without ODSP.
 * `versions` is the newest-first list the fake `listFileVersions` returns; `seqByVersion` maps a
 * versionId to the sequence number the fake `resolveSequenceNumber` returns (a missing id makes it
 * throw, modelling a parse failure). `replay` configures the epoch getters and retained ops used by
 * the `validateBaseForReplay` path.
 */
function makeManager(
	versions: OdspFileVersionRef[],
	seqByVersion: Record<string, number>,
	replay: ReplayConfig = {},
): { manager: OdspVersionManager; fetcher: FakeFetcher; logger: MockLogger } {
	let listCallCount = 0;
	const resolved: string[] = [];
	const opsCalls: [number, number][] = [];
	const retainedOps = replay.retainedOps ?? [];
	const logger = new MockLogger();
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
		getLiveDocumentEpoch: async () => replay.liveEpoch,
		getRecoverableVersionEpoch: async (versionId: string) =>
			replay.versionEpochs ? replay.versionEpochs[versionId] : replay.liveEpoch,
		fetchOps: async (from: number, to: number) => {
			opsCalls.push([from, to]);
			return retainedOps.filter((seq) => seq >= from && seq < to);
		},
		listCalls: () => listCallCount,
		resolvedIds: () => [...resolved],
		opsCalls: () => [...opsCalls],
	};
	return {
		manager: new OdspVersionManager(fetcher, createChildLogger({ logger })),
		fetcher,
		logger,
	};
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

		it("re-enumerates and re-resolves after refresh()", async () => {
			// @q M-CACHE-02
			const versions = [ref("tip"), ref("42.0"), ref("40.0")];
			const seqs = { tip: 460, "42.0": 448, "40.0": 418 };
			const { manager, fetcher } = makeManager(versions, seqs);
			await manager.findBaseForSeq(430); // resolves 42.0 then 40.0
			manager.refresh();
			await manager.findBaseForSeq(430); // must re-fetch the list AND re-resolve seqs
			assert.equal(fetcher.listCalls(), 2, "refresh should force a re-enumeration");
			assert.deepEqual(
				fetcher.resolvedIds(),
				["42.0", "40.0", "42.0", "40.0"],
				"refresh should also clear the resolved sequence-number cache",
			);
		});

		it("does not let a fetch in flight during refresh() repopulate the cache", async () => {
			// @q M-CACHE-03
			let listCalls = 0;
			const gates: ((versions: OdspFileVersionRef[]) => void)[] = [];
			const fetcher: IOdspFileVersionFetcher = {
				listFileVersions: async () => {
					listCalls++;
					return new Promise<OdspFileVersionRef[]>((resolve) => gates.push(resolve));
				},
				resolveSequenceNumber: async (versionId: string) => Number.parseInt(versionId, 10),
				getLiveDocumentEpoch: async () => "epoch",
				getRecoverableVersionEpoch: async () => "epoch",
				fetchOps: async () => [],
			};
			const manager = new OdspVersionManager(fetcher);

			// Start a query so the version-list fetch is in flight, then refresh before it settles.
			const first = manager.listVersions();
			manager.refresh();
			gates[0]?.([ref("2"), ref("1")]); // the in-flight fetch settles AFTER the refresh
			await first;

			// The refresh must not have been overwritten by the late fetch: the next query re-fetches.
			const second = manager.listVersions();
			gates[1]?.([ref("2"), ref("1")]);
			await second;

			assert.equal(
				listCalls,
				2,
				"a refresh() during an in-flight fetch must force a re-fetch",
			);
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

	describe("validateBaseForReplay", () => {
		const base = {
			versionId: "40.0",
			sequenceNumber: 418,
			lastModifiedDateTime: "2026-01-01T00:00:00Z",
		};

		it("resolves when the base shares the live epoch and all ops through the target exist", async () => {
			// @q M-VALIDATE-01
			const { manager, fetcher, logger } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{
					liveEpoch: "epoch-A",
					retainedOps: [419, 420, 421, 422], // covers (418, 421]
				},
			);
			await manager.validateBaseForReplay(base, 421);
			// Only ops up to and including the target are requested: [419, 422).
			assert.deepEqual(fetcher.opsCalls(), [[419, 422]]);
			// The observed epochs are logged for real-traffic verification.
			logger.assertMatch([
				{
					eventName: "PointInTimeBaseLineageEpoch",
					baseVersionId: "40.0",
					baseEpoch: "epoch-A",
					liveEpoch: "epoch-A",
					epochsMatch: true,
				},
			]);
		});

		it("throws when the base version is on a different epoch than the live document", async () => {
			// @q M-VALIDATE-02
			const { manager, fetcher } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{
					liveEpoch: "epoch-live",
					versionEpochs: { "40.0": "epoch-old" },
					retainedOps: [419, 420, 421],
				},
			);
			await assert.rejects(
				async () => manager.validateBaseForReplay(base, 421),
				(error: Error) => {
					assert.match(error.message, /epoch "epoch-old".*epoch "epoch-live"/);
					assert.equal(
						(error as Partial<{ errorType: string }>).errorType,
						OdspErrorTypes.fileOverwrittenInStorage,
						"a lineage mismatch reuses the driver's fileOverwrittenInStorage error",
					);
					return true;
				},
			);
			// The op check must not run once the lineage check fails.
			assert.deepEqual(fetcher.opsCalls(), []);
		});

		it("throws (fails closed) when an epoch is unknown", async () => {
			// @q M-VALIDATE-03
			// No epoch configured -> both getLiveDocumentEpoch and getRecoverableVersionEpoch resolve undefined.
			const { manager } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{
					retainedOps: [419, 420, 421],
				},
			);
			await assert.rejects(
				async () => manager.validateBaseForReplay(base, 421),
				/Cannot verify.*lineage/,
			);
		});

		it("throws when the ops needed to reach the target were trimmed at the low end", async () => {
			// @q M-VALIDATE-04
			// base+1 = 419 is gone; earliest retained op is 425 -> a gap right after the base.
			const { manager } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{
					liveEpoch: "epoch-A",
					retainedOps: [425, 426, 427],
				},
			);
			await assert.rejects(
				async () => manager.validateBaseForReplay(base, 427),
				/expected sequence number 419 but the next available op is 425/,
			);
		});

		it("throws when there is a gap in the middle of the op range", async () => {
			// @q M-VALIDATE-05
			// 421 is missing between 420 and 422.
			const { manager } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{
					liveEpoch: "epoch-A",
					retainedOps: [419, 420, 422, 423],
				},
			);
			await assert.rejects(
				async () => manager.validateBaseForReplay(base, 423),
				/expected sequence number 421 but the next available op is 422/,
			);
		});

		it("throws when the server returns no ops at all", async () => {
			// @q M-VALIDATE-06
			const { manager } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{
					liveEpoch: "epoch-A",
					retainedOps: [],
				},
			);
			await assert.rejects(
				async () => manager.validateBaseForReplay(base, 421),
				/no ops at or after sequence number 419/,
			);
		});

		it("skips the op check when the target is at or before the base sequence number", async () => {
			// @q M-VALIDATE-07
			const { manager, fetcher } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{
					liveEpoch: "epoch-A",
					retainedOps: [],
				},
			);
			await manager.validateBaseForReplay(base, 418); // target === base seq: nothing to replay
			assert.deepEqual(
				fetcher.opsCalls(),
				[],
				"no ops should be fetched when there is nothing to replay",
			);
		});

		it("pages: keeps requesting from where the previous batch ended", async () => {
			// @q M-VALIDATE-08
			// The fake returns the whole retained range at once, but the loop must still advance `from`
			// correctly and stop exactly at the target (no request past target).
			const retainedOps = Array.from({ length: 10 }, (_, index) => 419 + index); // 419..428
			const { manager, fetcher } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{
					liveEpoch: "epoch-A",
					retainedOps,
				},
			);
			await manager.validateBaseForReplay(base, 428);
			assert.deepEqual(fetcher.opsCalls(), [[419, 429]]);
		});
	});
});
