/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Point-in-time scenario: snap a file version at a known state, then load the container to that
 * version's sequence number and assert the historical view matches the state at that point.
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
	"Point-in-time load to a snapped version (real service)",
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

		it("loads the container at the sequence number of a metadata-snapped version", async () => {
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

			// Advance to a known state, then summarize so the persisted snapshot advances past the
			// creation snapshot, and snap a version to capture it.
			await incrementAndSync(3);
			const targetSequenceNumber = container.deltaManager.lastSequenceNumber;
			const expectedValue = dataObject.value;
			await summarizePointInTime(summarizer);
			assert.strictEqual(
				await triggerVersionViaMetadata(versionApi, {
					description: `target-snap ${Date.now()}`,
				}),
				true,
				"metadata PATCH should snap the target version",
			);

			// Advance the live document past the target (and summarize + snap again) so the target
			// version is a recoverable base rather than the live tip, which the version manager skips.
			await incrementAndSync(3);
			await summarizePointInTime(summarizer);
			assert.strictEqual(
				await triggerVersionViaMetadata(versionApi, {
					description: `later-snap ${Date.now()}`,
				}),
				true,
			);

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
				expectedValue,
				"loaded value should match the state at the target sequence number",
			);
		});
	},
);
