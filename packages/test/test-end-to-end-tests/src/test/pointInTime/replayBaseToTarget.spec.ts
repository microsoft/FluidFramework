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
	loadPointInTimeContainer,
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

			const incrementAndSync = async (count: number): Promise<void> => {
				for (let i = 0; i < count; i++) {
					dataObject.increment();
				}
				await tracker.ensureSynchronized(container);
			};

			// Advance to a known state and snap a version to capture it. This snapped version's
			// sequence number is what we will treat as the point-in-time target below.
			await incrementAndSync(3);
			const targetSequenceNumber = container.deltaManager.lastSequenceNumber;
			const targetValue = dataObject.value;
			assert.strictEqual(
				await triggerVersionViaMetadata(versionApi, {
					description: `target-snap ${Date.now()}`,
				}),
				true,
				"metadata PATCH should snap the target version",
			);

			// Advance past the target and snap again so the target version is a recoverable base in the
			// history rather than the live tip (which the version manager skips). Crucially there is no
			// version restore or reupload here, so the whole op stream stays on one epoch/lineage.
			await incrementAndSync(3);
			assert.strictEqual(
				await triggerVersionViaMetadata(versionApi, {
					description: `later-snap ${Date.now()}`,
				}),
				true,
				"metadata PATCH should snap a later version",
			);

			// Look at the version history: there must be recoverable versions the driver can resolve a
			// base from for our target. (We keep the assertion loose because the service may coalesce or
			// add versions of its own; we only need at least the two we snapped.)
			const versions = await listFileVersions(versionApi);
			assert(
				versions.length >= 2,
				`expected at least the two snapped versions in history, saw ${versions.length}`,
			);

			// Load to the target sequence number. Internally the point-in-time factory resolves a base
			// at/before the target, validates the base is on the live document's epoch (no mismatch),
			// validates the bridging ops are still retained, and replays them up to the target.
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
				"loaded container should be materialized exactly at the target sequence number",
			);
			assert.strictEqual(
				loadedObject.value,
				targetValue,
				"replayed state must match the document's state at the target sequence number",
			);
		});
	},
);
