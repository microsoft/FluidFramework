/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Unit coverage for the op-availability half of {@link OdspVersionManager.validateBaseForReplay}.
 * The base snapshot already represents state at `base.sequenceNumber`, so replaying it forward to the
 * target needs every op in the half-open range `(base.sequenceNumber, target]` to still be retained
 * and contiguous. Retention is finite (e.g. ~7 days), so a base older than the window can have the
 * bridging ops trimmed. These tests cover the positive path (contiguous ops replay cleanly, only the
 * needed range is requested) and the negative paths (a low-end gap, a mid-range gap, and an empty
 * response all raise a clear error).
 */

import { strict as assert } from "node:assert";

import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";

import type { ResolvedVersion } from "../odspVersionManager/odspVersionManager.js"; // eslint-disable-line import-x/no-internal-modules

import { makeManager, ref } from "./odspVersionManagerTestFakes.js";

describe("OdspVersionManager.validateBaseForReplay: op-availability (base -> target) check", () => {
	const base: ResolvedVersion = {
		versionId: "40.0",
		sequenceNumber: 418,
		lastModifiedDateTime: "2026-01-01T00:00:00Z",
	};

	describe("positive: the op stream from base to target is complete", () => {
		it("resolves and requests only (base, target] when all ops exist", async () => {
			// @q M-OPS-01
			const { manager, fetcher } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{ liveEpoch: "epoch-A", retainedOps: [419, 420, 421, 422] }, // covers (418, 421]
			);
			await manager.validateBaseForReplay(base, 421);
			// Only ops up to and including the target are requested: [419, 422).
			assert.deepEqual(fetcher.opsCalls(), [[419, 422]]);
		});

		it("skips the op check entirely when the target is at or before the base (0-op replay)", async () => {
			// @q M-OPS-02
			const { manager, fetcher } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{ liveEpoch: "epoch-A", retainedOps: [] },
			);
			await manager.validateBaseForReplay(base, 418); // target === base seq: nothing to replay
			assert.deepEqual(
				fetcher.opsCalls(),
				[],
				"no ops should be fetched when there is nothing to replay",
			);
		});

		it("advances across a paged response and stops exactly at the target (no request past target)", async () => {
			// @q M-OPS-03
			const retainedOps = Array.from({ length: 10 }, (_, index) => 419 + index); // 419..428
			const { manager, fetcher } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{ liveEpoch: "epoch-A", retainedOps },
			);
			await manager.validateBaseForReplay(base, 428);
			assert.deepEqual(fetcher.opsCalls(), [[419, 429]]);
		});
	});

	describe("negative: ops between base and target are missing", () => {
		it("throws when the ops right after the base were trimmed at the low end", async () => {
			// @q M-OPS-04
			// base+1 = 419 is gone; earliest retained op is 425 -> a gap right after the base.
			const { manager } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{ liveEpoch: "epoch-A", retainedOps: [425, 426, 427] },
			);
			await assert.rejects(
				async () => manager.validateBaseForReplay(base, 427),
				/expected sequence number 419 but the next available op is 425/,
			);
		});

		it("throws when there is a gap in the middle of the op range", async () => {
			// @q M-OPS-05
			// 421 is missing between 420 and 422.
			const { manager } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{ liveEpoch: "epoch-A", retainedOps: [419, 420, 422, 423] },
			);
			await assert.rejects(
				async () => manager.validateBaseForReplay(base, 423),
				(error: Error) => {
					assert.match(
						error.message,
						/expected sequence number 421 but the next available op is 422/,
					);
					assert.equal(
						(error as Partial<{ errorType: string }>).errorType,
						OdspErrorTypes.cannotCatchUp,
						"a gap (trimmed op) surfaces as a cannotCatchUp driver error",
					);
					return true;
				},
			);
		});

		it("throws when the server returns no ops at all for the range", async () => {
			// @q M-OPS-06
			const { manager } = makeManager(
				[ref("tip"), ref("40.0")],
				{ tip: 460, "40.0": 418 },
				{ liveEpoch: "epoch-A", retainedOps: [] },
			);
			await assert.rejects(
				async () => manager.validateBaseForReplay(base, 421),
				(error: Error) => {
					assert.match(error.message, /no ops at or after sequence number 419/);
					assert.equal(
						(error as Partial<{ errorType: string }>).errorType,
						OdspErrorTypes.cannotCatchUp,
						"trimmed-by-retention ops surface as a cannotCatchUp driver error",
					);
					assert.equal(
						(error as Partial<{ canRetry: boolean }>).canRetry,
						false,
						"trimmed ops never come back on retry",
					);
					return true;
				},
			);
		});
	});
});
