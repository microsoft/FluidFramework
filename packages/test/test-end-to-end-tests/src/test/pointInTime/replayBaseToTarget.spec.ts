/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Point-in-time happy path (real service): the positive counterpart to the epoch-mismatch and
 * op-trimming failure suites. It arranges a document whose op stream is intact and on a single
 * lineage (no version restore, no download-and-reupload), inspects the file's version history to
 * pick a target sequence number, then loads the container to that target. The load must succeed:
 * the driver resolves a base at/before the target, confirms the base shares the live document's
 * epoch, confirms the bridging ops are still retained, and replays them so the materialized state
 * matches exactly what the document held at the target sequence number.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import type { IRuntimeFactory } from "@fluidframework/container-definitions/internal";
import {
	ITestObjectProvider,
	LoaderContainerTracker,
	createDocumentId,
} from "@fluidframework/test-utils/internal";

import {
	listFileVersions,
	triggerVersionViaMetadata,
	type OdspVersionTestApiProps,
} from "./odspVersionTestApi.js";
import { createOdspVersionTestApiProps } from "./odspVersionTestFixture.js";
import {
	createAttachedPointInTimeContainer,
	createPointInTimeRuntimeFactory,
	createPointInTimeSummarizer,
	loadPointInTimeContainer,
	summarizePointInTime,
	type IPointInTimeTestObject,
} from "./pointInTimeTestUtils.js";

describeCompat(
	"Point-in-time replay from base to target (real service)",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		let provider: ITestObjectProvider;
		let runtimeFactory: IRuntimeFactory;
		const tracker = new LoaderContainerTracker();

		before(function () {
			provider = getTestObjectProvider();
			if (provider.driver.type !== "odsp") {
				this.skip();
			}
			runtimeFactory = createPointInTimeRuntimeFactory(apis);
		});

		afterEach(() => tracker.reset());

		it("replays ops from a resolved base up to a target taken from the version history", async () => {
			const documentId = createDocumentId();
			const container = await createAttachedPointInTimeContainer(
				provider,
				runtimeFactory,
				tracker,
				documentId,
			);
			const dataObject = (await container.getEntryPoint()) as IPointInTimeTestObject;
			const versionApi: OdspVersionTestApiProps = createOdspVersionTestApiProps(
				provider,
				container,
			);
			const summarizer = await createPointInTimeSummarizer(provider, container, apis);

			const incrementAndSync = async (count: number): Promise<void> => {
				for (let i = 0; i < count; i++) {
					dataObject.increment();
				}
				await tracker.ensureSynchronized(container);
			};

			// Snap a new file version by first forcing a summary (so the persisted snapshot advances
			// past the creation snapshot and the bridging ops are flushed into the queryable op stream),
			// then PATCHing the item description so the driveItem version captures that advanced state.
			// Doing this repeatedly (between batches of ops) builds up multiple recoverable base
			// candidates spread across the op stream, so the driver can resolve a base with the bridging
			// ops still retained.
			let snapCount = 0;
			const snapVersion = async (): Promise<void> => {
				await summarizePointInTime(summarizer);
				assert.strictEqual(
					await triggerVersionViaMetadata(versionApi, {
						description: `snap-${snapCount++} ${Date.now()}`,
					}),
					true,
					"metadata PATCH should snap a new version",
				);
			};

			// Interleave op batches with version snaps so history accumulates several recoverable
			// versions and there are plenty of retained ops to replay forward. There is no version
			// restore or reupload anywhere here, so the whole op stream stays on one epoch/lineage.
			await incrementAndSync(2);
			await snapVersion();

			// Record an EARLY target, then snap so it becomes a recoverable point in history.
			await incrementAndSync(2);
			const earlyTargetSequenceNumber = container.deltaManager.lastSequenceNumber;
			const earlyTargetValue = dataObject.value;
			await snapVersion();

			// Advance further and record a LATER target with a distinct value/sequence number.
			await incrementAndSync(3);
			const lateTargetSequenceNumber = container.deltaManager.lastSequenceNumber;
			const lateTargetValue = dataObject.value;
			await snapVersion();

			// Keep snapping newer versions past both targets so each target is a recoverable base in the
			// middle of the history rather than the live tip (which the version manager skips).
			await incrementAndSync(2);
			await snapVersion();
			await incrementAndSync(2);
			await snapVersion();

			// Sanity: the two targets must be genuinely different points, otherwise loading to each
			// could not distinguish "replayed to the requested target" from "loaded a fixed point".
			assert(
				lateTargetSequenceNumber > earlyTargetSequenceNumber,
				"late target must be after the early target",
			);
			assert.notStrictEqual(
				lateTargetValue,
				earlyTargetValue,
				"the two targets must hold different state so a replay-to-target can be observed",
			);

			// Look at the version history: the driver resolves the base for a target from these
			// recoverable versions. (Loose lower bound because the service may coalesce or add its own.)
			const versions = await listFileVersions(versionApi);
			assert(
				versions.length >= snapCount,
				`expected at least the ${snapCount} snapped versions in history, saw ${versions.length}`,
			);

			// Load to a target sequence number. Internally the point-in-time factory resolves a base
			// at/before the target, validates the base is on the live document's epoch (no mismatch),
			// validates the bridging ops are still retained, and replays them up to the target.
			const loadToTarget = async (
				targetSequenceNumber: number,
				expectedValue: number,
				label: string,
			): Promise<void> => {
				const loaded = await loadPointInTimeContainer(
					provider,
					runtimeFactory,
					documentId,
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

			// Loading to two different targets and getting each target's distinct state proves the
			// loader actually replayed the ops up to the requested target (a bug that loaded the live
			// tip, or the base snapshot unchanged, would return the same value for both).
			await loadToTarget(earlyTargetSequenceNumber, earlyTargetValue, "early target");
			await loadToTarget(lateTargetSequenceNumber, lateTargetValue, "late target");
		});
	},
);
