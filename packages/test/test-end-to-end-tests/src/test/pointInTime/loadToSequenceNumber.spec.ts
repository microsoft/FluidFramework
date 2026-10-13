/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Point-in-time happy path (real service): the positive counterpart to the epoch-mismatch failure
 * suite. Every case arranges a document whose op stream is intact and on a single lineage (no version
 * restore, no download-and-reupload), then loads the container to a target sequence number with
 * `loadContainerToSequenceNumber`. Each load resolves a base at/before the target, confirms the base
 * shares the live document's epoch, confirms the bridging ops are still retained, replays them, and
 * must materialize exactly the state the document held at that target sequence number.
 *
 * The cases differ only in where the target sits relative to the version history:
 * - at a snapped version boundary,
 * - mid-stream between versions (bridging ops replayed from the base), and
 * - two distinct mid-stream targets, proving each load reflects its own requested point.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";

import { listFileVersions } from "./odspVersionTestApi.js";
import {
	createPointInTimeTestContext,
	loadPointInTimeContainer,
	setupPointInTimeSuite,
	type IPointInTimeTestObject,
	type PointInTimeTestContext,
} from "./pointInTimeTestUtils.js";

describeCompat(
	"Point-in-time load to a sequence number (real service)",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const suite = setupPointInTimeSuite(getTestObjectProvider, apis);

		/**
		 * Load a fresh container to `targetSequenceNumber` and assert it materialized exactly at that
		 * seq with the expected counter value. Internally the point-in-time factory resolves a base
		 * at/before the target, validates the base shares the live document's epoch, validates the
		 * bridging ops are still retained, and replays them up to the target.
		 */
		const assertLoadsToTarget = async (
			ctx: PointInTimeTestContext,
			targetSequenceNumber: number,
			expectedValue: number,
			label: string,
		): Promise<void> => {
			const loaded = await loadPointInTimeContainer(
				suite.provider(),
				suite.runtimeFactory(),
				ctx.documentId,
				targetSequenceNumber,
			);
			const loadedObject = (await loaded.getEntryPoint()) as IPointInTimeTestObject;
			assert.strictEqual(
				loaded.deltaManager.lastSequenceNumber,
				targetSequenceNumber,
				`${label}: loaded container should be materialized exactly at the target sequence number`,
			);
			assert.strictEqual(
				loadedObject.value,
				expectedValue,
				`${label}: replayed state must match the document's state at the target sequence number`,
			);
		};

		it("loads at the sequence number of a metadata-snapped version (version boundary)", async function (this: Mocha.Context) {
			// Multiple summaries + a load against the real service, so raise the timeout accordingly.
			this.timeout(120_000);

			const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
			const { container, dataObject, incrementAndSync, snapVersion } = ctx;

			// Advance to a known state, then snap a version to capture it (snapVersion forces a summary
			// first so the persisted snapshot advances past the creation snapshot). The target seq is a
			// version boundary.
			await incrementAndSync(3);
			const targetSequenceNumber = container.deltaManager.lastSequenceNumber;
			const expectedValue = dataObject.value;
			await snapVersion("target-snap");

			// Advance past the target (and snap again) so the target version is a recoverable base rather
			// than the live tip, which the version manager skips.
			await incrementAndSync(3);
			await snapVersion("later-snap");

			await assertLoadsToTarget(ctx, targetSequenceNumber, expectedValue, "version boundary");
		});

		it("loads at a mid-stream sequence number by replaying ops from the base", async function (this: Mocha.Context) {
			// Multiple summaries + a load against the real service, so raise the timeout accordingly.
			this.timeout(120_000);

			const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
			const { container, dataObject, incrementAndSync, snapVersion } = ctx;

			// Snap an early base version so a recoverable base exists at/before the "pre" point.
			await incrementAndSync(2);
			await snapVersion("base-snap");

			// Record a "pre" point mid-stream (not at a version boundary).
			await incrementAndSync(2);
			const preSequenceNumber = container.deltaManager.lastSequenceNumber;
			const preValue = dataObject.value;

			// Make more changes and record a "post" point, also mid-stream.
			await incrementAndSync(4);
			const postSequenceNumber = container.deltaManager.lastSequenceNumber;
			const postValue = dataObject.value;
			assert(postSequenceNumber > preSequenceNumber, "post seq should be after pre seq");

			// Snap again so neither the pre nor post target lands on the live tip (which is skipped).
			await snapVersion("tip-snap");

			// Each load replays the bridging ops from the base up to the requested mid-stream seq.
			await assertLoadsToTarget(ctx, preSequenceNumber, preValue, "pre");
			await assertLoadsToTarget(ctx, postSequenceNumber, postValue, "post");
		});

		it("loads two distinct targets and reflects each target's own state", async function (this: Mocha.Context) {
			// Several summaries + two loads against the real service, so raise the timeout accordingly.
			this.timeout(120_000);

			const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
			const { container, dataObject, versionApi, incrementAndSync, snapVersion } = ctx;

			// Interleave op batches with version snaps so history accumulates several recoverable
			// versions and there are plenty of retained ops to replay forward. Each snap forces a summary
			// (so the persisted snapshot advances past the creation snapshot and the bridging ops are
			// flushed into the queryable op stream) then PATCHes the item so the driveItem version
			// captures that advanced state. There is no version restore or reupload anywhere here, so the
			// whole op stream stays on one epoch/lineage.
			await incrementAndSync(2);
			await snapVersion("snap");

			// Record an EARLY target, then snap so it becomes a recoverable point in history.
			await incrementAndSync(2);
			const earlyTargetSequenceNumber = container.deltaManager.lastSequenceNumber;
			const earlyTargetValue = dataObject.value;
			await snapVersion("snap");

			// Advance further and record a LATER target with a distinct value/sequence number.
			await incrementAndSync(3);
			const lateTargetSequenceNumber = container.deltaManager.lastSequenceNumber;
			const lateTargetValue = dataObject.value;
			await snapVersion("snap");

			// Keep snapping newer versions past both targets so each target is a recoverable base in the
			// middle of the history rather than the live tip (which the version manager skips).
			await incrementAndSync(2);
			await snapVersion("snap");
			await incrementAndSync(2);
			await snapVersion("snap");

			// Sanity: the two targets must be genuinely different points, otherwise loading to each could
			// not distinguish "replayed to the requested target" from "loaded a fixed point".
			assert(
				lateTargetSequenceNumber > earlyTargetSequenceNumber,
				"late target must be after the early target",
			);
			assert.notStrictEqual(
				lateTargetValue,
				earlyTargetValue,
				"the two targets must hold different state so a replay-to-target can be observed",
			);

			// The driver resolves the base for a target from these recoverable versions. (Loose lower
			// bound because the service may coalesce or add its own.)
			const versions = await listFileVersions(versionApi);
			assert(
				versions.length >= ctx.snapCount(),
				`expected at least the ${ctx.snapCount()} snapped versions in history, saw ${versions.length}`,
			);

			// Loading to two different targets and getting each target's distinct state proves the loader
			// actually replayed the ops up to the requested target (a bug that loaded the live tip, or the
			// base snapshot unchanged, would return the same value for both).
			await assertLoadsToTarget(
				ctx,
				earlyTargetSequenceNumber,
				earlyTargetValue,
				"early target",
			);
			await assertLoadsToTarget(ctx, lateTargetSequenceNumber, lateTargetValue, "late target");
		});
	},
);
