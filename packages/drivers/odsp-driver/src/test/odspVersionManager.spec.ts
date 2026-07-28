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
		getLiveDocumentEpoch: async () => replayConfig.liveEpoch,
		getRecoverableVersionEpoch: async (versionId: string) =>
			replayConfig.versionEpochs
				? replayConfig.versionEpochs[versionId]
				: replayConfig.liveEpoch,
		listCalls: () => listCallCount,
		resolvedIds: () => [...resolved],
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
});
