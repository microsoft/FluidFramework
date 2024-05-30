/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { IHostLoader } from "@fluidframework/container-definitions/internal";
import { IContainerExperimental } from "@fluidframework/container-loader/internal";
import { DefaultSummaryConfiguration } from "@fluidframework/container-runtime/internal";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { toDeltaManagerInternal } from "@fluidframework/runtime-utils/internal";
import type {
	IIntervalCollection,
	SequenceInterval,
	SharedString,
} from "@fluidframework/sequence/internal";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

const stringId = "sharedStringKey";
const collectionId = "collectionKey";

const assertIntervals = (
	sharedString: SharedString,
	intervalCollection: IIntervalCollection<SequenceInterval>,
	expected: readonly { start: number; end: number }[],
	validateOverlapping: boolean = true,
) => {
	const actual = Array.from(intervalCollection);
	if (validateOverlapping && sharedString.getLength() > 0) {
		const overlapping = intervalCollection.findOverlappingIntervals(
			0,
			sharedString.getLength() - 1,
		);
		assert.deepEqual(actual, overlapping, "Interval search returned inconsistent results");
	}
	assert.strictEqual(
		actual.length,
		expected.length,
		`findOverlappingIntervals() must return the expected number of intervals`,
	);

	const actualPos = actual.map((interval) => {
		assert(interval);
		const start = sharedString.localReferencePositionToPosition(interval.start);
		const end = sharedString.localReferencePositionToPosition(interval.end);
		return { start, end };
	});
	assert.deepEqual(actualPos, expected, "intervals are not as expected");
};

describeCompat("IntervalCollection with stashed ops", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedString } = apis.dds;

	const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});

	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: {
					...DefaultSummaryConfiguration,
					...{
						maxTime: 5000 * 12,
						maxAckWaitTime: 120000,
						maxOps: 1,
						initialSummarizerDelayMs: 20,
					},
				},
			},
			enableRuntimeIdCompressor: "on",
		},
		loaderProps: {
			configProvider: configProvider({
				"Fluid.Container.enableOfflineLoad": true,
			}),
		},
	};

	let provider: ITestObjectProvider;
	let container1: IContainerExperimental;
	let sharedString1: SharedString;
	let sharedString2: SharedString;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;
	let collection1: IIntervalCollection<SequenceInterval>;
	let collection2: IIntervalCollection<SequenceInterval>;
	let loader: IHostLoader;
	let url;

	beforeEach(async () => {
		provider = getTestObjectProvider();
		container1 = await provider.makeTestContainer(testContainerConfig);
		dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);
		sharedString1.insertText(0, "hello world");
		collection1 = sharedString1.getIntervalCollection(collectionId);
		loader = provider.makeTestLoader(testContainerConfig);
		url = await container1.getAbsoluteUrl("");
	});

	it("doesn't resend successful op", async () => {
		// add an interval
		const id = collection1.add({ start: 4, end: 7 }).getIntervalId();

		// pending ops stuff from e2e tests - make a new container, pause op processing,
		// make a change, close the container, then resume op processing and reload container
		const container: IContainerExperimental =
			await provider.loadTestContainer(testContainerConfig);
		await waitForContainerConnection(container);
		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;

		[...Array(30).keys()].map((i) =>
			dataStore.root.set(`make sure csn is > 1 so it doesn't hide bugs ${i}`, i),
		);

		await provider.ensureSynchronized();
		await provider.opProcessingController.pauseProcessing(container);
		assert(toDeltaManagerInternal(dataStore.runtime.deltaManager).outbound.paused);

		// the "callback" portion of the original e2e test
		const sharedString = await dataStore.getSharedObject<SharedString>(stringId);
		const collection = sharedString.getIntervalCollection(collectionId);
		collection.change(id, { start: 3, end: 8 });

		const pendingState: string | undefined = await container.closeAndGetPendingLocalState?.();
		provider.opProcessingController.resumeProcessing();
		assert.ok(pendingState);

		container1 = await provider.loadTestContainer(testContainerConfig);
		await waitForContainerConnection(container1);
		dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);
		collection1 = sharedString1.getIntervalCollection(collectionId);
		await provider.ensureSynchronized();
		assertIntervals(sharedString1, collection1, [{ start: 4, end: 7 }]);

		let container2 = await loader.resolve({ url }, pendingState);
		await waitForContainerConnection(container1);
		dataObject2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
		collection2 = sharedString2.getIntervalCollection(collectionId);
		await provider.ensureSynchronized();
		assertIntervals(sharedString2, collection2, [{ start: 3, end: 8 }]);

		collection1.change(id, { start: 2, end: 9 });
		await provider.ensureSynchronized();

		// reload the container and verify that the above change takes effect
		container2 = await provider.loadTestContainer(testContainerConfig);
		dataObject2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
		collection2 = sharedString2.getIntervalCollection(collectionId);

		await waitForContainerConnection(container2);
		await provider.ensureSynchronized();

		assertIntervals(sharedString1, collection1, [{ start: 2, end: 9 }]);
		assertIntervals(sharedString2, collection2, [{ start: 2, end: 9 }]);
	});
});
