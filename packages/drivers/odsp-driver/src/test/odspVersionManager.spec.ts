/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import {
	OdspVersionManager,
	type OdspFileVersionRef,
	type IOdspFileVersionFetcher,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../odspVersionManager/odspVersionManager.js";

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
	/** Number of times the live document's epoch was read. */
	readonly liveEpochCalls: () => number;
	/** Version ids passed to getRecoverableVersionEpoch, in call order. */
	readonly versionEpochIds: () => string[];
}

/**
 * Optional epoch behavior for {@link makeManager}, used by the lineage-validation tests.
 * `liveEpoch`/`versionEpochs` back the epoch getters compared by `findBaseForSeq`'s lineage check.
 */
interface ReplayConfig {
	readonly liveEpoch?: string;
	readonly versionEpochs?: Record<string, string | undefined>;
}

/*
 * Create a manager backed by in-memory fakes so the selection logic can be tested without ODSP.
 * `versions` is the newest-first list the fake `listFileVersions` returns; `seqByVersion` maps a
 * versionId to the sequence number the fake `resolveSequenceNumber` returns (a missing id makes it
 * throw, modelling a parse failure). `replay` configures the epoch getters used by `findBaseForSeq`'s
 * lineage check; it defaults to a single shared epoch so selection tests pass the check by default.
 */
function makeManager(
	versions: OdspFileVersionRef[],
	seqByVersion: Record<string, number>,
	replay?: ReplayConfig,
): { manager: OdspVersionManager; fetcher: FakeFetcher; logger: MockLogger } {
	// Default to a single shared epoch so selection tests pass findBaseForSeq's inline lineage check.
	const replayConfig: ReplayConfig = replay ?? { liveEpoch: "epoch" };
	let listCallCount = 0;
	const resolved: string[] = [];
	let liveEpochCallCount = 0;
	const versionEpochResolved: string[] = [];
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
		getLiveDocumentEpoch: async () => {
			liveEpochCallCount++;
			return replayConfig.liveEpoch;
		},
		getRecoverableVersionEpoch: async (versionId: string) => {
			versionEpochResolved.push(versionId);
			return replayConfig.versionEpochs
				? replayConfig.versionEpochs[versionId]
				: replayConfig.liveEpoch;
		},
		listCalls: () => listCallCount,
		resolvedIds: () => [...resolved],
		liveEpochCalls: () => liveEpochCallCount,
		versionEpochIds: () => [...versionEpochResolved],
	};
	return {
		manager: new OdspVersionManager(fetcher),
		fetcher,
		logger,
	};
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

		it("does not memoize a failed version-list fetch — a later call retries", async () => {
			// @q M-CACHE-02
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
				getLiveDocumentEpoch: async () => "epoch",
				getRecoverableVersionEpoch: async () => "epoch",
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
				getLiveDocumentEpoch: async () => "epoch",
				getRecoverableVersionEpoch: async () => "epoch",
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

	describe("findBaseForSeq: lineage validation of the chosen base", () => {
		it("returns the base when it shares the live document's epoch", async () => {
			// @q M-VALIDATE-01
			const { manager } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{ liveEpoch: "epoch-A" },
			);
			const result = await manager.findBaseForSeq(430);
			assert.deepEqual(result, {
				kind: "found",
				base: {
					versionId: "40.0",
					sequenceNumber: 418,
					lastModifiedDateTime: "2026-01-01T00:00:00.000Z",
				},
			});
		});

		it("throws when the chosen base is on a different epoch than the live document", async () => {
			// @q M-VALIDATE-02
			const { manager } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{
					liveEpoch: "epoch-live",
					versionEpochs: { "40.0": "epoch-old" },
				},
			);
			await assert.rejects(
				async () => manager.findBaseForSeq(430),
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
		});

		it("throws (fails closed) when an epoch is unknown", async () => {
			// @q M-VALIDATE-03
			// Both getLiveDocumentEpoch and getRecoverableVersionEpoch resolve undefined.
			const { manager } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{
					versionEpochs: {},
				},
			);
			await assert.rejects(
				async () => manager.findBaseForSeq(430),
				(error: Error) => {
					assert.match(error.message, /Cannot verify.*lineage/);
					// A missing epoch header is an unexpected storage response, not caller misuse:
					// it must surface as incorrectServerResponse (not usageError) and be non-retryable
					// so the load fails closed rather than replaying across an unverifiable lineage.
					assert.equal(
						(error as Partial<{ errorType: string }>).errorType,
						OdspErrorTypes.incorrectServerResponse,
						"a missing epoch is reported as incorrectServerResponse, not usageError",
					);
					assert.equal(
						(error as Partial<{ canRetry: boolean }>).canRetry,
						false,
						"an unverifiable lineage never resolves on retry",
					);
					return true;
				},
			);
		});

		it("throws (fails closed) when only the live document's epoch is unknown", async () => {
			// @q M-VALIDATE-04
			const { manager } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				// liveEpoch omitted (undefined); the base resolves a known epoch.
				{ versionEpochs: { "40.0": "epoch-old" } },
			);
			await assert.rejects(
				async () => manager.findBaseForSeq(430),
				(error: Error) => {
					assert.equal(
						(error as Partial<{ errorType: string }>).errorType,
						OdspErrorTypes.incorrectServerResponse,
					);
					return true;
				},
			);
		});

		it("throws (fails closed) when only the base version's epoch is unknown", async () => {
			// @q M-VALIDATE-05
			const { manager } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				// The live epoch is known but the chosen base's version-scoped read returns undefined.
				{ liveEpoch: "epoch-live", versionEpochs: {} },
			);
			await assert.rejects(
				async () => manager.findBaseForSeq(430),
				(error: Error) => {
					assert.equal(
						(error as Partial<{ errorType: string }>).errorType,
						OdspErrorTypes.incorrectServerResponse,
					);
					return true;
				},
			);
		});
	});

	describe("findBaseForSeq: epoch caching", () => {
		it("caches a numbered version's epoch but re-reads the live epoch each time", async () => {
			// @q M-VALIDATE-CACHE-01
			// A numbered version's snapshot is immutable, so its epoch is read once and cached; the live
			// document's epoch can change (restore/reupload) and must be read fresh on every check.
			const versions = [ref("tip"), ref("42.0"), ref("40.0")];
			const seqs = { tip: 460, "42.0": 448, "40.0": 418 };
			const { manager, fetcher } = makeManager(versions, seqs, { liveEpoch: "epoch" });

			await manager.findBaseForSeq(430); // base 40.0
			await manager.findBaseForSeq(430); // base 40.0 again - epoch should come from cache

			assert.deepEqual(
				fetcher.versionEpochIds(),
				["40.0"],
				"the chosen base's epoch should be fetched once and then served from cache",
			);
			assert.equal(
				fetcher.liveEpochCalls(),
				2,
				"the live document's epoch must be re-read on every lineage check (never cached)",
			);
		});
	});
});
