/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Unit coverage for the lineage (ODSP epoch) half of
 * {@link OdspVersionManager.validateBaseForReplay}. A version restore or download-then-reupload bumps
 * the file's `x-fluid-epoch` and renumbers the op stream, so a base whose epoch differs from the live
 * document is a different lineage: replaying the live ops onto it would silently corrupt state. These
 * tests assert the manager fails closed (mismatch or unknown epoch) and short-circuits before the
 * op-availability check.
 */

import { strict as assert } from "node:assert";

import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";

import type { ResolvedVersion } from "../odspVersionManager/odspVersionManager.js"; // eslint-disable-line import-x/no-internal-modules

import { makeManager, ref } from "./odspVersionManagerTestFakes.js";

describe("OdspVersionManager.validateBaseForReplay: lineage (epoch) check", () => {
	const base: ResolvedVersion = {
		versionId: "40.0",
		sequenceNumber: 418,
		lastModifiedDateTime: "2026-01-01T00:00:00Z",
	};

	it("resolves when the base shares the live document's epoch (and logs the observed epochs)", async () => {
		// @q M-EPOCH-01
		const { manager, logger } = makeManager(
			[ref("tip"), ref("40.0")],
			{ tip: 460, "40.0": 418 },
			{ liveEpoch: "epoch-A", retainedOps: [419, 420, 421] },
		);
		await manager.validateBaseForReplay(base, 421);
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

	it("throws a non-retryable fileOverwrittenInStorage error when the base is on a different epoch", async () => {
		// @q M-EPOCH-02
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
				assert.equal(
					(error as Partial<{ canRetry: boolean }>).canRetry,
					false,
					"a lineage mismatch never resolves on retry",
				);
				return true;
			},
		);
		// The op-availability check must never run once the lineage check fails.
		assert.deepEqual(fetcher.opsCalls(), []);
	});

	it("records the observed (mismatched) epochs in telemetry before failing", async () => {
		// @q M-EPOCH-03
		const { manager, logger } = makeManager(
			[ref("tip"), ref("40.0")],
			{ tip: 460, "40.0": 418 },
			{
				liveEpoch: "epoch-live",
				versionEpochs: { "40.0": "epoch-old" },
				retainedOps: [419, 420, 421],
			},
		);
		await assert.rejects(async () => manager.validateBaseForReplay(base, 421));
		logger.assertMatch([
			{
				eventName: "PointInTimeBaseLineageEpoch",
				baseVersionId: "40.0",
				baseEpoch: "epoch-old",
				liveEpoch: "epoch-live",
				epochsMatch: false,
			},
		]);
	});

	it("throws (fails closed) when the live document's epoch is unknown", async () => {
		// @q M-EPOCH-04
		const { manager, fetcher } = makeManager(
			[ref("tip"), ref("40.0")],
			{ tip: 460, "40.0": 418 },
			{ versionEpochs: { "40.0": "epoch-old" }, retainedOps: [419, 420, 421] },
		);
		await assert.rejects(
			async () => manager.validateBaseForReplay(base, 421),
			/Cannot verify.*lineage.*live epoch: unknown/s,
		);
		assert.deepEqual(fetcher.opsCalls(), [], "op check must not run when lineage is unproven");
	});

	it("throws (fails closed) when the base version's epoch is unknown", async () => {
		// @q M-EPOCH-05
		const { manager, fetcher } = makeManager(
			[ref("tip"), ref("40.0")],
			{ tip: 460, "40.0": 418 },
			{ liveEpoch: "epoch-live", versionEpochs: { "40.0": undefined }, retainedOps: [419] },
		);
		await assert.rejects(
			async () => manager.validateBaseForReplay(base, 421),
			/Cannot verify.*lineage.*base epoch: unknown/s,
		);
		assert.deepEqual(fetcher.opsCalls(), [], "op check must not run when lineage is unproven");
	});

	it("throws (fails closed) when both epochs are unknown", async () => {
		// @q M-EPOCH-06
		const { manager } = makeManager(
			[ref("tip"), ref("40.0")],
			{ tip: 460, "40.0": 418 },
			{ retainedOps: [419, 420, 421] },
		);
		await assert.rejects(
			async () => manager.validateBaseForReplay(base, 421),
			/Cannot verify.*lineage/,
		);
	});
});
