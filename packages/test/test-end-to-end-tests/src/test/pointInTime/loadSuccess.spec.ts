/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Point-in-time LOAD SUCCESS regressions (real service).
 *
 * A focused companion to `loadToSequenceNumber.spec.ts`. That suite proves the core happy paths
 * (version-boundary, mid-stream, and two-distinct-targets replay); this file adds the edge and
 * contract regressions that guard the *successful* load surface:
 *
 * - loading at the earliest recoverable point (the oldest, not just a middle, version),
 * - determinism: loading the same target twice yields identical materialized state,
 * - the returned container's contract: a disconnected, read-only, still-open historical view pinned
 *   exactly at the target sequence number (never advancing to the live tip), and
 * - correctness across a deep history: many versions between the base and the live tip still replay
 *   forward to the exact requested state.
 *
 * Every case keeps the op stream intact and on a single lineage (no version restore, no
 * download-and-reupload), so each load is expected to succeed. The failure counterparts (epoch
 * mismatch, ops unavailable) live in `loadFailure.spec.ts` and `epochMismatch.spec.ts`.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";

import {
	createPointInTimeTestContext,
	loadPointInTimeContainer,
	setupPointInTimeSuite,
	type IPointInTimeTestObject,
	type PointInTimeTestContext,
} from "./pointInTimeTestUtils.js";

describeCompat(
	"Point-in-time load success (real service)",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const suite = setupPointInTimeSuite(getTestObjectProvider, apis);

		/**
		 * Load a fresh container to `targetSequenceNumber` and return it alongside its replayed counter
		 * value, so individual cases can assert both the materialized state and the container contract.
		 */
		const loadToTarget = async (
			ctx: PointInTimeTestContext,
			targetSequenceNumber: number,
		): Promise<{ container: IContainer; value: number }> => {
			const container = await loadPointInTimeContainer(
				suite.provider(),
				suite.runtimeFactory(),
				ctx.documentId,
				targetSequenceNumber,
			);
			const loadedObject = (await container.getEntryPoint()) as IPointInTimeTestObject;
			return { container, value: loadedObject.value };
		};

		/**
		 * Assert a load materialized exactly at `targetSequenceNumber` with `expectedValue`.
		 */
		const assertLoadsToTarget = async (
			ctx: PointInTimeTestContext,
			targetSequenceNumber: number,
			expectedValue: number,
			label: string,
		): Promise<void> => {
			const { container, value } = await loadToTarget(ctx, targetSequenceNumber);
			assert.strictEqual(
				container.deltaManager.lastSequenceNumber,
				targetSequenceNumber,
				`${label}: loaded container should be materialized exactly at the target sequence number`,
			);
			assert.strictEqual(
				value,
				expectedValue,
				`${label}: replayed state must match the document's state at the target sequence number`,
			);
		};

		it("loads at the earliest recoverable version and reflects that early state", async function (this: Mocha.Context) {
			// Several summaries + a load against the real service, so raise the timeout accordingly.
			this.timeout(120_000);

			const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
			const { container, dataObject, incrementAndSync, snapVersion } = ctx;

			// Capture the very first recoverable point, then snap it so it becomes a base in history.
			await incrementAndSync(2);
			const earliestSequenceNumber = container.deltaManager.lastSequenceNumber;
			const earliestValue = dataObject.value;
			await snapVersion("earliest");

			// Pile several newer versions on top so the earliest is the OLDEST recoverable base, far from
			// the live tip - the case a "load the newest thing" bug would silently pass.
			await incrementAndSync(2);
			await snapVersion("mid");
			await incrementAndSync(2);
			await snapVersion("late");
			await incrementAndSync(2);
			await snapVersion("latest");

			await assertLoadsToTarget(ctx, earliestSequenceNumber, earliestValue, "earliest");
		});

		it("is deterministic: loading the same target twice yields identical state", async function (this: Mocha.Context) {
			// Multiple summaries + two loads against the real service, so raise the timeout accordingly.
			this.timeout(120_000);

			const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
			const { container, dataObject, incrementAndSync, snapVersion } = ctx;

			await incrementAndSync(2);
			await snapVersion("base");

			// A mid-stream target (not a version boundary) so both loads must replay bridging ops.
			await incrementAndSync(3);
			const targetSequenceNumber = container.deltaManager.lastSequenceNumber;
			const expectedValue = dataObject.value;

			await incrementAndSync(2);
			await snapVersion("tip");

			// Two independent loads of the same target must agree on both the sequence number they
			// stopped at and the replayed value - a replay that depended on hidden state (caches, order)
			// would diverge here.
			const first = await loadToTarget(ctx, targetSequenceNumber);
			const second = await loadToTarget(ctx, targetSequenceNumber);
			assert.strictEqual(
				first.container.deltaManager.lastSequenceNumber,
				targetSequenceNumber,
				"first load should stop exactly at the target",
			);
			assert.strictEqual(
				second.container.deltaManager.lastSequenceNumber,
				targetSequenceNumber,
				"second load should stop exactly at the target",
			);
			assert.strictEqual(
				first.value,
				expectedValue,
				"first load should replay to the expected value",
			);
			assert.strictEqual(
				second.value,
				first.value,
				"loading the same target twice must yield identical state",
			);
		});

		it("returns a disconnected, read-only historical view pinned at the target", async function (this: Mocha.Context) {
			// Multiple summaries + a load against the real service, so raise the timeout accordingly.
			this.timeout(120_000);

			const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
			const { container, dataObject, incrementAndSync, snapVersion } = ctx;

			await incrementAndSync(2);
			await snapVersion("base");
			await incrementAndSync(3);
			const targetSequenceNumber = container.deltaManager.lastSequenceNumber;
			const expectedValue = dataObject.value;
			await incrementAndSync(2);
			await snapVersion("tip");

			const { container: loaded, value } = await loadToTarget(ctx, targetSequenceNumber);

			// The point-in-time container is a historical view: it must not advance past the target,
			assert.strictEqual(
				loaded.deltaManager.lastSequenceNumber,
				targetSequenceNumber,
				"historical view must be pinned exactly at the target sequence number",
			);
			assert.strictEqual(value, expectedValue, "historical view must hold the target's state");
			// must be returned disconnected (no live delta-stream connection is ever established),
			assert.strictEqual(
				loaded.connectionState,
				ConnectionState.Disconnected,
				"historical view must be returned disconnected",
			);
			// must be forced read-only (no changes can be made to it),
			assert.strictEqual(
				loaded.readOnlyInfo.readonly,
				true,
				"historical view must be read-only",
			);
			// and must be a live (not closed) object the caller can still inspect.
			assert.strictEqual(loaded.closed, false, "historical view should be open, not closed");
		});

		it("replays correctly across a deep history to an early target", async function (this: Mocha.Context) {
			// Eight forced summaries against the real service. summarizeNow bounds each summarySubmitted
			// wait by the current test timeout, so the default (~20s) is too small for this deep history
			// and a later summary times out; raise it to match the other heavy real-service cases.
			this.timeout(120_000);

			const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
			const { container, dataObject, incrementAndSync, snapVersion } = ctx;

			// Establish an early target near the start of a long history.
			await incrementAndSync(2);
			await snapVersion("v0");
			await incrementAndSync(2);
			const earlyTargetSequenceNumber = container.deltaManager.lastSequenceNumber;
			const earlyTargetValue = dataObject.value;

			// Grow a deep history (many versions and op batches) on top of the early target so the load
			// must resolve a base well before the tip and replay a long bridge forward.
			for (let i = 1; i <= 6; i++) {
				await snapVersion(`v${i}`);
				await incrementAndSync(2);
			}
			await snapVersion("tip");

			await assertLoadsToTarget(
				ctx,
				earlyTargetSequenceNumber,
				earlyTargetValue,
				"deep-history early target",
			);
		});
	},
);
