/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	Marker,
	ReferenceType,
	reservedMarkerIdKey,
} from "@fluidframework/merge-tree/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	createSummarizer,
	getContainerEntryPointBackCompat,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

const stringId = "sharedStringKey";

describeCompat("SharedString", "FullCompat", (getTestObjectProvider, apis) => {
	const { SharedString } = apis.dds;

	const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	let sharedString1: SharedString;
	let sharedString2: SharedString;
	let dataObject1: ITestFluidObject;

	beforeEach("setupSharedStrings", async () => {
		const container1 = await provider.makeTestContainer(testContainerConfig);
		dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);

		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataObject2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
	});

	it("can sync SharedString across multiple containers", async () => {
		const text = "syncSharedString";
		sharedString1.insertText(0, text);
		assert.equal(
			sharedString1.getText(),
			text,
			"The retrieved text should match the inserted text.",
		);

		// Wait for the ops to to be submitted and processed across the containers.
		await provider.ensureSynchronized();

		assert.equal(
			sharedString2.getText(),
			text,
			"The inserted text should have synced across the containers",
		);
	});

	it("can sync SharedString to a newly loaded container", async () => {
		const text = "syncToNewContainer";
		sharedString1.insertText(0, text);
		assert.equal(
			sharedString1.getText(),
			text,
			"The retrieved text should match the inserted text.",
		);

		// Create a initialize a new container with the same id.
		const newContainer = await provider.loadTestContainer(testContainerConfig);
		const newComponent =
			await getContainerEntryPointBackCompat<ITestFluidObject>(newContainer);
		const newSharedString = await newComponent.getSharedObject<SharedString>(stringId);

		// Wait for the ops to to be submitted and processed across the containers.
		await provider.ensureSynchronized();

		assert.equal(
			newSharedString.getText(),
			text,
			"The new container should receive the inserted text on creation",
		);
	});

	it("marker passes on attachment directly and transitively to any referenced DDS", async () => {
		// Insert a simple marker.
		sharedString1.insertMarker(0, ReferenceType.Simple, {
			[reservedMarkerIdKey]: "markerId",
		});
		const detachedString1 = SharedString.create(dataObject1.runtime, "detachedString1");
		detachedString1.insertMarker(0, ReferenceType.Simple, {
			[reservedMarkerIdKey]: "markerId",
		});
		const detachedString2 = SharedString.create(dataObject1.runtime, "detachedString2");

		// When an unattached DDS refers to another unattached DDS, both remain unattached
		const simpleMarker = detachedString1.getMarkerFromId("markerId") as Marker;
		const prop = { color: detachedString2.handle };
		detachedString1.annotateMarker(simpleMarker, prop);

		assert.equal(
			detachedString1.isAttached(),
			false,
			"detachedString1 should not be attached",
		);
		assert.equal(
			detachedString2.isAttached(),
			false,
			"detachedString2 should not be attached",
		);
		assert.equal(sharedString1.isAttached(), true, "sharedString1 should be attached");

		// When referring SharedString becomes attached, the referred SharedString becomes attached
		// and the attachment transitively passes to a second referred SharedString
		const simpleMarker2 = sharedString1.getMarkerFromId("markerId") as Marker;
		const prop2 = { color: detachedString1.handle };
		sharedString1.annotateMarker(simpleMarker2, prop2);

		assert.equal(detachedString1.isAttached(), true, "detachedString1 should be attached");
		assert.equal(detachedString2.isAttached(), true, "detachedString2 should be attached");
		assert.equal(sharedString1.isAttached(), true, "sharedString1 should be attached");
	});
});

describeCompat("SharedString grouped batching", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedString } = apis.dds;

	const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};
	const groupedBatchingContainerConfig: ITestContainerConfig = {
		...testContainerConfig,
		runtimeOptions: { enableGroupedBatching: true },
	};

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	it("can load summarized grouped batch at min seqnum", async function () {
		// We've seen flakiness in ODSP and r11s. This test is verifying SharedString logic regardless of what service handles the ops/summary.
		if (!["local", "tinylicious", "t9s"].includes(provider.driver.type)) {
			this.skip();
		}
		const container1 = await provider.makeTestContainer(groupedBatchingContainerConfig);
		const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
		const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);

		const text = "syncSharedString";
		dataObject1.context.containerRuntime.orderSequentially(() => {
			for (let i = 0; i < text.length; i++) {
				sharedString1.insertText(i, text.charAt(i));
			}
		});

		// Grouped batch should be min seqnum
		await provider.ensureSynchronized();

		sharedString1.insertText(0, "a");
		await provider.ensureSynchronized();
		const { summarizer } = await createSummarizer(provider, container1, testContainerConfig);
		await summarizeNow(summarizer);

		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);

		// These calls ensures assert 0x072 isn't hit
		sharedString2.insertText(0, "a");
		await provider.ensureSynchronized();
	});

	it("can load summarized grouped batch", async function () {
		// We've seen flakiness in ODSP and r11s. This test is verifying SharedString logic regardless of what service handles the ops/summary.
		if (!["local", "tinylicious", "t9s"].includes(provider.driver.type)) {
			this.skip();
		}
		const container1 = await provider.makeTestContainer(groupedBatchingContainerConfig);
		const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
		const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);

		const text = "syncSharedString";
		dataObject1.context.containerRuntime.orderSequentially(() => {
			for (let i = 0; i < text.length; i++) {
				sharedString1.insertText(i, text.charAt(i));
			}
		});

		// Summarize grouped batch
		await provider.ensureSynchronized();
		const { summarizer } = await createSummarizer(provider, container1, testContainerConfig);
		await summarizeNow(summarizer);

		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);

		// These calls ensures assert 0x072 isn't hit
		sharedString2.insertText(0, "a");
		await provider.ensureSynchronized();
	});
});
