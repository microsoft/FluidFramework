/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Point-in-time scenario: record a "pre" sequence number, make more changes, record a "post"
 * sequence number, then load the container to each. Loading to `post` exercises replay of the ops
 * between the base version and `post`, and each load must reflect exactly the state at that seq.
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
	"Point-in-time replay between sequence numbers (real service)",
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

		it("replays ops to load the container at both a pre- and post-change sequence number", async () => {
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

			// Summarize so the persisted snapshot advances past the creation snapshot, then snap an
			// early base version so a recoverable base exists at/before the "pre" point.
			await incrementAndSync(2);
			await summarizePointInTime(summarizer);
			assert.strictEqual(
				await triggerVersionViaMetadata(versionApi, {
					description: `base-snap ${Date.now()}`,
				}),
				true,
			);

			// Record the "pre" point.
			await incrementAndSync(2);
			const preSequenceNumber = container.deltaManager.lastSequenceNumber;
			const preValue = dataObject.value;

			// Make more changes and record the "post" point.
			await incrementAndSync(4);
			const postSequenceNumber = container.deltaManager.lastSequenceNumber;
			const postValue = dataObject.value;
			assert(postSequenceNumber > preSequenceNumber, "post seq should be after pre seq");

			// Summarize + snap again so neither the pre nor post target lands on the live tip (which is
			// skipped).
			await summarizePointInTime(summarizer);
			assert.strictEqual(
				await triggerVersionViaMetadata(versionApi, { description: `tip-snap ${Date.now()}` }),
				true,
			);

			// Load to "pre": ops between the base version and pre are replayed.
			const preLoaded = await loadPointInTimeContainer(
				provider,
				runtimeFactory,
				documentId,
				preSequenceNumber,
			);
			const preObject = (await preLoaded.getEntryPoint()) as IPointInTimeTestObject;
			assert.strictEqual(
				preLoaded.deltaManager.lastSequenceNumber,
				preSequenceNumber,
				"pre-loaded container should be at the pre sequence number",
			);
			assert.strictEqual(preObject.value, preValue, "pre-loaded value should match pre state");

			// Load to "post": ops through post are replayed.
			const postLoaded = await loadPointInTimeContainer(
				provider,
				runtimeFactory,
				documentId,
				postSequenceNumber,
			);
			const postObject = (await postLoaded.getEntryPoint()) as IPointInTimeTestObject;
			assert.strictEqual(
				postLoaded.deltaManager.lastSequenceNumber,
				postSequenceNumber,
				"post-loaded container should be at the post sequence number",
			);
			assert.strictEqual(
				postObject.value,
				postValue,
				"post-loaded value should match post state",
			);
		});
	},
);
