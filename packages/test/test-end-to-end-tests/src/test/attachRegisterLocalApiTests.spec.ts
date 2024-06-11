/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import { IRequest } from "@fluidframework/core-interfaces";
import type { ISharedMap } from "@fluidframework/map/internal";
import {
	IContainerRuntimeBase,
	type IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import { SharedObject } from "@fluidframework/shared-object-base/internal";
import {
	ITestFluidObject,
	ITestObjectProvider,
	LoaderContainerTracker,
	LocalCodeLoader,
	TestFluidObject,
	TestFluidObjectFactory,
	createDocumentId,
} from "@fluidframework/test-utils/internal";

/*
Context no longer provides observability point to when context changes its attach states
Instead context notifies attached channel only.
Tests here want to know inner details of context, thus this workaround to achive old behavior by reaching out
into guts of the context implementation.
If this stops working in the future, I'd advice to get rid of tests that need to know inner details of context
*/
function onAttachChange(
	context: IFluidDataStoreContext,
	stateToNotify: AttachState.Attaching | AttachState.Attached,
	callback: () => void,
) {
	const oldApi = (context as any).setAttachState.bind(context);

	(context as any).setAttachState = (arg) => {
		oldApi(arg);
		if (arg === stateToNotify) {
			callback();
		}
	};
}

// REVIEW: enable compat testing?
describeCompat(
	`Attach/Reference Api Tests For Attached Container`,
	"NoCompat" /* 2.0.0-internal.8.0.0 */,
	(getTestObjectProvider, apis) => {
		const { SharedMap } = apis.dds;
		const codeDetails: IFluidCodeDetails = {
			package: "detachedContainerTestPackage1",
			config: {},
		};
		const mapId1 = "mapId1";
		const mapId2 = "mapId2";

		let request: IRequest;
		let loader: Loader;
		const loaderContainerTracker = new LoaderContainerTracker();

		const createTestStatementForAttachedDetached = (name: string, attached: boolean) =>
			`${name} should be ${attached ? "Attached" : "Detached"}`;

		async function createDetachedContainerAndGetEntryPoint() {
			const container = await loader.createDetachedContainer(codeDetails);
			// Get the root dataStore from the detached container.
			const defaultDataStore = (await container.getEntryPoint()) as ITestFluidObject;
			return {
				container,
				defaultDataStore,
			};
		}

		const createPeerDataStore = async (containerRuntime: IContainerRuntimeBase) => {
			const dataStore = await containerRuntime.createDataStore(["default"]);
			const peerDataStore = (await dataStore.entryPoint.get()) as ITestFluidObject;
			return {
				peerDataStore,
				peerDataStoreRuntimeChannel: peerDataStore.channel,
			};
		};

		function createTestLoader(): Loader {
			const factory: TestFluidObjectFactory = new TestFluidObjectFactory([
				[mapId1, SharedMap.getFactory()],
				[mapId2, SharedMap.getFactory()],
			]);
			const urlResolver = provider.urlResolver;
			const codeLoader = new LocalCodeLoader([[codeDetails, factory]]);
			const documentServiceFactory = provider.documentServiceFactory;
			const testLoader = new Loader({
				urlResolver,
				documentServiceFactory,
				codeLoader,
				logger: provider.logger,
			});
			loaderContainerTracker.add(testLoader);
			return testLoader;
		}

		let provider: ITestObjectProvider;
		beforeEach("createLoader", async () => {
			provider = getTestObjectProvider();
			const documentId = createDocumentId();
			const driver = provider.driver;
			request = driver.createCreateNewRequest(documentId);
			loader = createTestLoader();
		});

		afterEach(() => {
			loaderContainerTracker.reset();
		});

		it("Attaching dataStore should not attach unregistered DDS", async () => {
			const { container, defaultDataStore } = await createDetachedContainerAndGetEntryPoint();
			await container.attach(request);

			// Create another dataStore which returns the runtime channel.
			const { peerDataStore: dataStore2 } = await createPeerDataStore(
				defaultDataStore.context.containerRuntime,
			);

			assert(
				dataStore2.runtime.attachState === AttachState.Detached,
				createTestStatementForAttachedDetached("DataStore2", false),
			);

			// Create a channel
			const channel = dataStore2.runtime.createChannel(
				"test1",
				"https://graph.microsoft.com/types/map",
			);
			assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

			defaultDataStore.root.set("dataStore2", dataStore2.handle);
			await provider.ensureSynchronized();

			assert(
				dataStore2.runtime.attachState !== AttachState.Detached,
				createTestStatementForAttachedDetached("DataStore2", true),
			);

			assert.strictEqual(
				channel.handle.isAttached,
				false,
				"Channel should not be attached as it was not registered",
			);
		});

		it("Attaching dataStore should attach registered DDS", async () => {
			const { container, defaultDataStore } = await createDetachedContainerAndGetEntryPoint();
			await container.attach(request);

			// Create another dataStore which returns the runtime channel.
			const { peerDataStore: dataStore2 } = await createPeerDataStore(
				defaultDataStore.context.containerRuntime,
			);
			assert(
				dataStore2.runtime.attachState === AttachState.Detached,
				createTestStatementForAttachedDetached("DataStore2", false),
			);

			// Create a channel
			const channel = dataStore2.runtime.createChannel(
				"test1",
				"https://graph.microsoft.com/types/map",
			);
			assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

			// Now register the channel
			((await channel.handle.get()) as SharedObject).bindToContext();

			defaultDataStore.root.set("dataStore2", dataStore2.handle);
			await provider.ensureSynchronized();
			assert(
				dataStore2.runtime.attachState !== AttachState.Detached,
				createTestStatementForAttachedDetached("DataStore2", true),
			);

			// Channel should get attached as it was registered to its dataStore
			assert.strictEqual(
				channel.handle.isAttached,
				true,
				createTestStatementForAttachedDetached("Channel", true),
			);
		});

		it("Attaching DDS should attach dataStore", async () => {
			const { container, defaultDataStore } = await createDetachedContainerAndGetEntryPoint();
			await container.attach(request);

			// Create another dataStore which returns the runtime channel.
			const { peerDataStore: dataStore2 } = await createPeerDataStore(
				defaultDataStore.context.containerRuntime,
			);
			assert(
				dataStore2.runtime.attachState === AttachState.Detached,
				createTestStatementForAttachedDetached("DataStore2", false),
			);

			// Create a channel
			const channel = dataStore2.runtime.createChannel(
				"test1",
				"https://graph.microsoft.com/types/map",
			);
			assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

			toFluidHandleInternal(channel.handle).attachGraph();

			// Channel should get attached as it was registered to its dataStore
			assert.strictEqual(
				channel.handle.isAttached,
				true,
				createTestStatementForAttachedDetached("Channel", true),
			);

			assert(
				dataStore2.runtime.attachState !== AttachState.Detached,
				createTestStatementForAttachedDetached("DataStore2", true),
			);
		});

		it("Sticking handle in attached dds should attach the DDS in attached container", async () => {
			const { container, defaultDataStore } = await createDetachedContainerAndGetEntryPoint();
			await container.attach(request);

			// Create another dataStore which returns the runtime channel.
			const { peerDataStore: dataStore2 } = await createPeerDataStore(
				defaultDataStore.context.containerRuntime,
			);
			assert(
				dataStore2.runtime.attachState === AttachState.Detached,
				createTestStatementForAttachedDetached("DataStore2", false),
			);

			// Create a channel
			const channel = dataStore2.runtime.createChannel(
				"test1",
				"https://graph.microsoft.com/types/map",
			);
			assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

			defaultDataStore.root.set("dataStore2", dataStore2.handle);
			await provider.ensureSynchronized();

			const rootOfDataStore2 = (await dataStore2.runtime.getChannel("root")) as ISharedMap;
			const testChannelOfDataStore2 = await dataStore2.runtime.getChannel("test1");

			assert.strictEqual(
				rootOfDataStore2.isAttached(),
				true,
				"Root Channel should be attached",
			);
			assert.strictEqual(
				testChannelOfDataStore2.isAttached(),
				false,
				"Test Channel should not be attached",
			);
			rootOfDataStore2.set("test1handle", channel.handle);

			assert.strictEqual(
				testChannelOfDataStore2.isAttached(),
				true,
				"Test Channel should be attached only in attached container after sticking it in referenced dds",
			);
		});

		it("Registering DDS in attached dataStore should attach it", async () => {
			const { container, defaultDataStore } = await createDetachedContainerAndGetEntryPoint();
			await container.attach(request);

			// Create another dataStore which returns the runtime channel.
			const { peerDataStore: dataStore2 } = await createPeerDataStore(
				defaultDataStore.context.containerRuntime,
			);

			assert(
				dataStore2.runtime.attachState === AttachState.Detached,
				createTestStatementForAttachedDetached("DataStore2", false),
			);

			// Create a channel
			const channel = dataStore2.runtime.createChannel(
				"test1",
				"https://graph.microsoft.com/types/map",
			);
			assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

			defaultDataStore.root.set("dataStore2", dataStore2.handle);
			await provider.ensureSynchronized();

			((await channel.handle.get()) as SharedObject).bindToContext();
			assert.strictEqual(
				channel.handle.isAttached,
				true,
				createTestStatementForAttachedDetached("Channel", true),
			);
		});

		it("Registering DDS in detached dataStore should not attach it", async () => {
			const { container, defaultDataStore } = await createDetachedContainerAndGetEntryPoint();
			await container.attach(request);

			// Create another dataStore which returns the runtime channel.
			const { peerDataStore: dataStore2 } = await createPeerDataStore(
				defaultDataStore.context.containerRuntime,
			);

			assert(
				dataStore2.runtime.attachState === AttachState.Detached,
				createTestStatementForAttachedDetached("DataStore2", false),
			);

			// Create a channel
			const channel = dataStore2.runtime.createChannel(
				"test1",
				"https://graph.microsoft.com/types/map",
			);
			assert.strictEqual(channel.handle.isAttached, false, "Channel should be detached");

			((await channel.handle.get()) as SharedObject).bindToContext();
			assert.strictEqual(
				channel.handle.isAttached,
				false,
				"Channel should not get attached on registering it to unattached dataStore",
			);
		});

		it("Stick handle of 2 dds in each other and then attaching dataStore should attach both DDS", async () => {
			const { container, defaultDataStore } = await createDetachedContainerAndGetEntryPoint();
			await container.attach(request);

			// Create another dataStore which returns the runtime channel.
			const { peerDataStore: dataStore2 } = await createPeerDataStore(
				defaultDataStore.context.containerRuntime,
			);

			assert(
				dataStore2.runtime.attachState === AttachState.Detached,
				createTestStatementForAttachedDetached("DataStore2", false),
			);

			// Create first channel
			const channel1 = dataStore2.runtime.createChannel(
				"test1",
				"https://graph.microsoft.com/types/map",
			);
			assert.strictEqual(channel1.handle.isAttached, false, "Channel should be detached");

			// Create second channel
			const channel2 = dataStore2.runtime.createChannel(
				"test2",
				"https://graph.microsoft.com/types/map",
			);
			assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

			// Now register both dds to parent dataStore
			((await channel1.handle.get()) as SharedObject).bindToContext();
			((await channel2.handle.get()) as SharedObject).bindToContext();

			const testChannel1OfDataStore2 = (await dataStore2.runtime.getChannel(
				"test1",
			)) as ISharedMap;
			const testChannel2OfDataStore2 = (await dataStore2.runtime.getChannel(
				"test2",
			)) as ISharedMap;

			testChannel1OfDataStore2.set("test2handle", channel2.handle);
			testChannel2OfDataStore2.set("test1handle", channel1.handle);

			// Now attach the dataStore2. Currently this will end up in infinite loop.
			defaultDataStore.root.set("dataStore2", dataStore2.handle);
			await provider.ensureSynchronized();

			assert.strictEqual(
				testChannel1OfDataStore2.handle.isAttached,
				true,
				createTestStatementForAttachedDetached("Test Channel 1", true),
			);
			assert.strictEqual(
				testChannel2OfDataStore2.handle.isAttached,
				true,
				createTestStatementForAttachedDetached("Test Channel 1", true),
			);
		});

		it("Stick handle of 2 dds in each other and then attaching 1 DDS should attach other DDS", async () => {
			const { container, defaultDataStore } = await createDetachedContainerAndGetEntryPoint();
			await container.attach(request);

			// Create another dataStore which returns the runtime channel.
			const peerDataStore = await createPeerDataStore(
				defaultDataStore.context.containerRuntime,
			);
			const dataStore2 = peerDataStore.peerDataStore;

			assert(
				dataStore2.runtime.attachState === AttachState.Detached,
				createTestStatementForAttachedDetached("DataStore2", false),
			);

			// Create first channel
			const channel1 = dataStore2.runtime.createChannel(
				"test1",
				"https://graph.microsoft.com/types/map",
			);
			assert.strictEqual(channel1.handle.isAttached, false, "Channel should be detached");

			// Create second channel
			const channel2 = dataStore2.runtime.createChannel(
				"test2",
				"https://graph.microsoft.com/types/map",
			);
			assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

			// Now register both dds to parent dataStore
			((await channel1.handle.get()) as SharedObject).bindToContext();
			((await channel2.handle.get()) as SharedObject).bindToContext();

			const testChannel1OfDataStore2 = (await dataStore2.runtime.getChannel(
				"test1",
			)) as ISharedMap;
			const testChannel2OfDataStore2 = (await dataStore2.runtime.getChannel(
				"test2",
			)) as ISharedMap;

			testChannel1OfDataStore2.set("test2handle", channel2.handle);
			testChannel2OfDataStore2.set("test1handle", channel1.handle);

			toFluidHandleInternal(channel1.handle).attachGraph();
			assert.strictEqual(
				testChannel1OfDataStore2.isAttached(),
				true,
				"Test Channel 1 should be attached now after attaching graph it",
			);
			assert.strictEqual(
				testChannel2OfDataStore2.isAttached(),
				true,
				"Test Channel 2 should be attached now after attaching other DDS",
			);
		});

		it(
			"Stick handle of 2 dds(of 2 different dataStores) in each other and then attaching 1 DDS should " +
				"attach other DDS and dataStore with correct recursion",
			async () => {
				const { container, defaultDataStore } =
					await createDetachedContainerAndGetEntryPoint();
				await container.attach(request);

				// Create another dataStore which returns the runtime channel.
				const peerDataStore1 = await createPeerDataStore(
					defaultDataStore.context.containerRuntime,
				);
				const dataStore2 = peerDataStore1.peerDataStore;
				assert(
					dataStore2.runtime.attachState === AttachState.Detached,
					createTestStatementForAttachedDetached("DataStore2", false),
				);

				// Create another dataStore which returns the runtime channel.
				const peerDataStore2 = await createPeerDataStore(
					defaultDataStore.context.containerRuntime,
				);
				const dataStore3 = peerDataStore2.peerDataStore;
				assert(
					dataStore3.runtime.attachState === AttachState.Detached,
					createTestStatementForAttachedDetached("DataStore2", false),
				);

				// Create first channel from dataStore2
				const channel2 = dataStore2.runtime.createChannel(
					"test1",
					"https://graph.microsoft.com/types/map",
				);
				assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

				// Create second channel from dataStore 3
				const channel3 = dataStore3.runtime.createChannel(
					"test2",
					"https://graph.microsoft.com/types/map",
				);
				assert.strictEqual(channel3.handle.isAttached, false, "Channel should be detached");

				const testChannelOfDataStore2 = (await dataStore2.runtime.getChannel(
					"test1",
				)) as ISharedMap;
				const testChannelOfDataStore3 = (await dataStore3.runtime.getChannel(
					"test2",
				)) as ISharedMap;

				testChannelOfDataStore2.set("channel3handle", channel3.handle);
				testChannelOfDataStore3.set("channel2handle", channel2.handle);

				// Currently it will go in infinite loop.
				toFluidHandleInternal(channel2.handle).attachGraph();
				assert.strictEqual(
					testChannelOfDataStore2.isAttached(),
					true,
					"Test Channel 1 should be attached now after attaching it",
				);
				assert.strictEqual(
					testChannelOfDataStore3.isAttached(),
					true,
					"Test Channel 2 should be attached now after attaching other DDS",
				);
				assert(
					dataStore2.runtime.attachState !== AttachState.Detached,
					"DataStore 2 should be attached",
				);
				assert(
					dataStore3.runtime.attachState !== AttachState.Detached,
					"DataStore 3 should be attached",
				);
			},
		);

		it(
			"Stick handle of 2 different dataStores and dds in each other and then attaching 1 dataStore should " +
				"attach other dataStores and dds with correct recursion",
			async () => {
				const { container, defaultDataStore } =
					await createDetachedContainerAndGetEntryPoint();
				await container.attach(request);

				// Create another data store which returns the runtime channel.
				const peerDataStore1 = await createPeerDataStore(
					defaultDataStore.context.containerRuntime,
				);
				const dataStore2 = peerDataStore1.peerDataStore as TestFluidObject;
				assert(
					dataStore2.runtime.attachState === AttachState.Detached,
					"DataStore2 should be unattached",
				);

				// Create another data store which returns the runtime channel.
				const peerDataStore2 = await createPeerDataStore(
					defaultDataStore.context.containerRuntime,
				);
				const dataStore3 = peerDataStore2.peerDataStore as TestFluidObject;
				assert(
					dataStore3.runtime.attachState === AttachState.Detached,
					"DataStore3 should be unattached",
				);

				// Create first channel from dataStore2
				const channel2 = await dataStore2.getSharedObject<ISharedMap>(mapId1);
				assert.strictEqual(channel2.handle.isAttached, false, "Channel should be detached");

				// Create second channel from dataStore 3
				const channel3 = await dataStore3.getSharedObject<ISharedMap>(mapId2);
				assert.strictEqual(channel3.handle.isAttached, false, "Channel should be detached");

				// dataStore2 POINTS TO dataStore3, channel3
				// dataStore3 POINTS TO dataStore2, channel2
				// channel2   POINTS TO dataStore3, channel3
				// channel3   POINTS TO dataStore2, channel2
				channel2.set("channel3handle", channel3.handle);
				channel3.set("channel2handle", channel2.handle);
				channel2.set("dataStore3", dataStore3.handle);
				channel3.set("dataStore2", dataStore2.handle);
				toFluidHandleInternal(dataStore2.handle).bind(
					toFluidHandleInternal(dataStore3.handle),
				);
				toFluidHandleInternal(dataStore2.handle).bind(
					toFluidHandleInternal(channel3.handle),
				);
				toFluidHandleInternal(dataStore3.handle).bind(
					toFluidHandleInternal(dataStore2.handle),
				);
				toFluidHandleInternal(dataStore3.handle).bind(
					toFluidHandleInternal(channel2.handle),
				);

				toFluidHandleInternal(dataStore2.handle).attachGraph();
				assert.strictEqual(
					channel2.isAttached(),
					true,
					"Test Channel 2 should be attached now after attaching it",
				);
				assert.strictEqual(
					channel3.isAttached(),
					true,
					"Test Channel 3 should be attached now after attaching other DDS",
				);
				assert.strictEqual(
					dataStore2.handle.isAttached,
					true,
					createTestStatementForAttachedDetached("DataStore2", true),
				);
			},
		);

		it(
			"Generate more than 1 dds of a dataStore and then stick handles in different dds and then attaching " +
				"1 handle should attach entire graph",
			async () => {
				const { container, defaultDataStore } =
					await createDetachedContainerAndGetEntryPoint();
				await container.attach(request);

				// Create another dataStore which returns the runtime channel.
				const peerDataStore1 = await createPeerDataStore(
					defaultDataStore.context.containerRuntime,
				);
				const dataStore2 = peerDataStore1.peerDataStore as TestFluidObject;
				assert(
					dataStore2.runtime.attachState === AttachState.Detached,
					"DataStore2 should be unattached",
				);

				// Create another dataStore which returns the runtime channel.
				// Create another dataStore which returns the runtime channel.
				const peerDataStore2 = await createPeerDataStore(
					defaultDataStore.context.containerRuntime,
				);
				const dataStore3 = peerDataStore2.peerDataStore as TestFluidObject;
				assert(
					dataStore3.runtime.attachState === AttachState.Detached,
					"DataStore3 should be unattached",
				);

				// Create another dataStore which returns the runtime channel.
				const peerDataStore3 = await createPeerDataStore(
					defaultDataStore.context.containerRuntime,
				);
				const dataStore4 = peerDataStore3.peerDataStore as TestFluidObject;
				assert(
					dataStore4.runtime.attachState === AttachState.Detached,
					"DataStore4 should be unattached",
				);

				// Create two channel from dataStore2
				const channel1OfDataStore2 = await dataStore2.getSharedObject<ISharedMap>(mapId1);
				assert.strictEqual(
					channel1OfDataStore2.handle.isAttached,
					false,
					"Channel should be detached",
				);

				const channel2OfDataStore2 = await dataStore2.getSharedObject<ISharedMap>(mapId2);
				assert.strictEqual(
					channel2OfDataStore2.handle.isAttached,
					false,
					"Channel should be detached",
				);

				// Create two channel from dataStore 3
				const channel1OfDataStore3 = await dataStore3.getSharedObject<ISharedMap>(mapId1);
				assert.strictEqual(
					channel1OfDataStore3.handle.isAttached,
					false,
					"Channel should be detached",
				);

				const channel2OfDataStore3 = await dataStore3.getSharedObject<ISharedMap>(mapId2);
				assert.strictEqual(
					channel2OfDataStore3.handle.isAttached,
					false,
					"Channel should be detached",
				);

				// Create one channel from dataStore 4
				const channel1OfDataStore4 = await dataStore4.getSharedObject<ISharedMap>(mapId1);
				assert.strictEqual(
					channel1OfDataStore4.handle.isAttached,
					false,
					"Channel should be detached",
				);

				channel2OfDataStore2.set("componet3Handle", dataStore3.handle);
				channel1OfDataStore3.set("channel23handle", channel2OfDataStore3.handle);
				toFluidHandleInternal(dataStore3.handle).bind(
					toFluidHandleInternal(dataStore4.handle),
				);

				// Channel 1 of dataStore 2 points to its parent dataStore 2.
				// Channel 2 of dataStore 2 points to its parent dataStore 2 and also to dataStore 3.
				// Channel 1 of dataStore 3 points to its parent dataStore 3 and its sibling channel 2 of dataStore 3.
				// Channel 2 of dataStore 3 points to its parent dataStore 3.
				// Channel 1 of dataStore 4 points to its parent dataStore 4.
				// DataStore 3 points to dataStore 4.
				toFluidHandleInternal(channel1OfDataStore2.handle).attachGraph();

				// Everything should be attached except channel 1 of dataStore 4
				assert.strictEqual(
					channel1OfDataStore2.isAttached(),
					true,
					"Test Channel 12 should be attached",
				);
				assert.strictEqual(
					channel2OfDataStore2.isAttached(),
					true,
					"Test Channel 22 should be attached",
				);
				assert.strictEqual(
					channel1OfDataStore3.isAttached(),
					true,
					"Test Channel 13 should be attached",
				);
				assert.strictEqual(
					channel2OfDataStore3.isAttached(),
					true,
					"Test Channel 23 should be attached",
				);
				assert(
					dataStore2.runtime.attachState !== AttachState.Detached,
					"DataStore 2 should have been attached",
				);
				assert(
					dataStore3.runtime.attachState !== AttachState.Detached,
					"DataStore 3 should have been attached",
				);
				assert(
					dataStore4.runtime.attachState !== AttachState.Detached,
					"DataStore 4 should have been attached",
				);
				assert.strictEqual(
					channel1OfDataStore4.isAttached(),
					true,
					"Test Channel 14 should be attached",
				);
			},
		);

		it("Attach events on container", async () => {
			const { container } = await createDetachedContainerAndGetEntryPoint();
			let attachEvent = false;
			container.on("attached", () => {
				assert.strictEqual(attachEvent, false, "Should be only one attach event");
				assert.strictEqual(
					container.attachState,
					AttachState.Attached,
					"Container should be attached at this stage",
				);
				attachEvent = true;
			});
			await container.attach(request);
			assert.strictEqual(
				container.attachState,
				AttachState.Attached,
				"Container should end up in attached state",
			);
		});

		it("Attach events on dataStores", async () => {
			const { container, defaultDataStore } = await createDetachedContainerAndGetEntryPoint();
			let dataStoreContextAttachState = AttachState.Detached;
			let dataStoreRuntimeAttachState = AttachState.Detached;
			onAttachChange(defaultDataStore.context, AttachState.Attaching, () => {
				assert.strictEqual(
					dataStoreContextAttachState,
					AttachState.Detached,
					"Should be fire from Detached state for context",
				);
				assert.strictEqual(
					defaultDataStore.context.attachState,
					AttachState.Attaching,
					"DataStore context should be attaching at this stage",
				);
				dataStoreContextAttachState = AttachState.Attaching;
			});

			onAttachChange(defaultDataStore.context, AttachState.Attached, () => {
				assert.strictEqual(
					dataStoreContextAttachState,
					AttachState.Attaching,
					"Should be fire from attaching state for context",
				);
				assert.strictEqual(
					defaultDataStore.context.attachState,
					AttachState.Attached,
					"DataStore context should be attached at this stage",
				);
				dataStoreContextAttachState = AttachState.Attached;
			});

			defaultDataStore.runtime.once("attaching", () => {
				assert.strictEqual(
					dataStoreRuntimeAttachState,
					AttachState.Detached,
					"Should be fire from Detached state for runtime",
				);
				assert.strictEqual(
					defaultDataStore.runtime.attachState,
					AttachState.Attaching,
					"Data store runtime should be attaching at this stage",
				);
				dataStoreRuntimeAttachState = AttachState.Attaching;
			});

			defaultDataStore.runtime.once("attached", () => {
				assert.strictEqual(
					dataStoreRuntimeAttachState,
					AttachState.Attaching,
					"Should be fire from attaching state for runtime",
				);
				assert.strictEqual(
					defaultDataStore.runtime.attachState,
					AttachState.Attached,
					"Data store runtime should be attached at this stage",
				);
				dataStoreRuntimeAttachState = AttachState.Attached;
			});
			await container.attach(request);
			assert.strictEqual(
				dataStoreContextAttachState,
				AttachState.Attached,
				"DataStore context should end up in attached state",
			);
			assert.strictEqual(
				dataStoreRuntimeAttachState,
				AttachState.Attached,
				"Data store runtime should end up in attached state",
			);
		});

		it("Attach events on referenced/unreferenced dataStores", async () => {
			const { container, defaultDataStore } = await createDetachedContainerAndGetEntryPoint();

			// Create first dataStore and store a reference
			const { peerDataStore: dataStore1 } = await createPeerDataStore(
				defaultDataStore.context.containerRuntime,
			);
			defaultDataStore.root.set("dataStore1", dataStore1.handle);

			// Create second dataStore but don't store a reference
			const { peerDataStore: dataStore2 } = await createPeerDataStore(
				defaultDataStore.context.containerRuntime,
			);

			let dataStore1AttachState = AttachState.Detached;
			onAttachChange(dataStore1.context, AttachState.Attaching, () => {
				assert.strictEqual(
					dataStore1AttachState,
					AttachState.Detached,
					"Should be fired from Detached state for context",
				);
				assert.strictEqual(
					dataStore1.context.attachState,
					AttachState.Attaching,
					"DataStore context should be attaching at this stage",
				);
				dataStore1AttachState = AttachState.Attaching;
			});

			onAttachChange(dataStore1.context, AttachState.Attached, () => {
				assert.strictEqual(
					dataStore1AttachState,
					AttachState.Attaching,
					"Should be fired from attaching state for context",
				);
				assert.strictEqual(
					dataStore1.context.attachState,
					AttachState.Attached,
					"DataStore context should be attached at this stage",
				);
				dataStore1AttachState = AttachState.Attached;
			});

			onAttachChange(dataStore2.context, AttachState.Attaching, () => {
				assert.fail("Attaching event should not be fired for unreferenced context");
			});

			onAttachChange(dataStore2.context, AttachState.Attached, () => {
				assert.fail("Attached event should not be fired for unreferenced context");
			});
			await container.attach(request);
			assert.strictEqual(
				dataStore1.runtime.attachState,
				AttachState.Attached,
				"DataStore 1 should end up in attached state",
			);
			assert.strictEqual(
				dataStore2.runtime.attachState,
				AttachState.Detached,
				"DataStore 2 should end up in detached state as it was not referenced",
			);
		});

		it("Attach events on referenced dataStores", async () => {
			const { container, defaultDataStore } = await createDetachedContainerAndGetEntryPoint();

			// Create first dataStore and store a reference in the root
			const { peerDataStore: dataStore1 } = await createPeerDataStore(
				defaultDataStore.context.containerRuntime,
			);
			defaultDataStore.root.set("dataStore1", dataStore1.handle);

			// Create second dataStore and store a reference in dataStore1
			const { peerDataStore: dataStore2 } = await createPeerDataStore(
				defaultDataStore.context.containerRuntime,
			);
			const rootMapOfDataStore1 = await dataStore1.getSharedObject<ISharedMap>(mapId1);
			rootMapOfDataStore1.set("dataStore2", dataStore2.handle);

			let dataStore1AttachState = AttachState.Detached;
			let dataStore2AttachState = AttachState.Detached;
			onAttachChange(dataStore1.context, AttachState.Attaching, () => {
				assert.strictEqual(
					dataStore1AttachState,
					AttachState.Detached,
					"Should be fire from Detached state for context",
				);
				assert.strictEqual(
					dataStore1.context.attachState,
					AttachState.Attaching,
					"DataStore context should be attaching at this stage",
				);
				dataStore1AttachState = AttachState.Attaching;
			});

			onAttachChange(dataStore1.context, AttachState.Attached, () => {
				assert.strictEqual(
					dataStore1AttachState,
					AttachState.Attaching,
					"Should be fire from attaching state for context",
				);
				assert.strictEqual(
					dataStore1.context.attachState,
					AttachState.Attached,
					"DataStore context should be attached at this stage",
				);
				dataStore1AttachState = AttachState.Attached;
			});

			onAttachChange(dataStore2.context, AttachState.Attaching, () => {
				assert.strictEqual(
					dataStore2AttachState,
					AttachState.Detached,
					"Should be fire from Detached state for context",
				);
				assert.strictEqual(
					dataStore2.context.attachState,
					AttachState.Attaching,
					"DataStore context should be attaching at this stage",
				);
				dataStore2AttachState = AttachState.Attaching;
			});

			onAttachChange(dataStore2.context, AttachState.Attached, () => {
				assert.strictEqual(
					dataStore2AttachState,
					AttachState.Attaching,
					"Should be fire from attaching state for context",
				);
				assert.strictEqual(
					dataStore2.context.attachState,
					AttachState.Attached,
					"DataStore context should be attached at this stage",
				);
				dataStore2AttachState = AttachState.Attached;
			});
			await container.attach(request);
			assert.strictEqual(
				dataStore1.runtime.attachState,
				AttachState.Attached,
				"DataStore 1 should end up in attached state",
			);
			assert.strictEqual(
				dataStore2.runtime.attachState,
				AttachState.Attached,
				"DataStore 2 should end up in attached state as its handle was stored in map of referenced dataStore",
			);
		});
	},
);
