/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import type { SharedCell } from "@fluidframework/cell";
import { Deferred } from "@fluidframework/core-utils";
import {
	AttachState,
	IContainer,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { ConnectionState, Loader } from "@fluidframework/container-loader";
import { ContainerMessageType } from "@fluidframework/container-runtime";
import { FluidObject, IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { DataStoreMessageType } from "@fluidframework/datastore";
import { IDocumentServiceFactory, IResolvedUrl } from "@fluidframework/driver-definitions";
import type { SharedDirectory, ISharedMap } from "@fluidframework/map";
import type { SharedMatrix } from "@fluidframework/matrix";
import { MergeTreeDeltaType } from "@fluidframework/merge-tree";
import type { ConsensusQueue } from "@fluidframework/ordered-collection";
import type { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import type { SharedString } from "@fluidframework/sequence";
import type { SparseMatrix } from "@fluid-experimental/sequence-deprecated";
import { createChildLogger, isFluidError } from "@fluidframework/telemetry-utils";
import {
	ITestContainerConfig,
	DataObjectFactoryType,
	ITestObjectProvider,
	ChannelFactoryRegistry,
	ITestFluidObject,
	LocalCodeLoader,
	SupportedExportInterfaces,
	TestFluidObjectFactory,
	waitForContainerConnection,
	timeoutPromise,
	getContainerEntryPointBackCompat,
	getDataStoreEntryPointBackCompat,
} from "@fluidframework/test-utils";
import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { wrapObjectAndOverride } from "../mocking.js";

const detachedContainerRefSeqNumber = 0;

const sharedStringId = "ss1Key";
const sharedMapId = "sm1Key";
const crcId = "crc1Key";
const cocId = "coc1Key";
const sharedDirectoryId = "sd1Key";
const sharedCellId = "scell1Key";
const sharedMatrixId = "smatrix1Key";
const sparseMatrixId = "sparsematrixKey";

const createFluidObject = async (dataStoreContext: IFluidDataStoreContext, type: string) => {
	const dataStore = await dataStoreContext.containerRuntime.createDataStore(type);
	return getDataStoreEntryPointBackCompat<ITestFluidObject>(dataStore);
};

describeCompat("Detached Container", "FullCompat", (getTestObjectProvider, apis) => {
	const {
		SharedString,
		SharedMap,
		ConsensusRegisterCollection,
		SharedDirectory,
		SharedCell,
		SharedMatrix,
		ConsensusQueue,
		SparseMatrix,
	} = apis.dds;

	const registry: ChannelFactoryRegistry = [
		[sharedStringId, SharedString.getFactory()],
		[sharedMapId, SharedMap.getFactory()],
		[crcId, ConsensusRegisterCollection.getFactory()],
		[sharedDirectoryId, SharedDirectory.getFactory()],
		[sharedCellId, SharedCell.getFactory()],
		[sharedMatrixId, SharedMatrix.getFactory()],
		[cocId, ConsensusQueue.getFactory()],
		[sparseMatrixId, SparseMatrix.getFactory()],
	];

	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	let request: IRequest;
	let loader: Loader;

	beforeEach("setup", function () {
		provider = getTestObjectProvider();
		request = provider.driver.createCreateNewRequest(provider.documentId);
		loader = provider.makeTestLoader(testContainerConfig) as Loader;
	});

	it("Create detached container", async () => {
		const container: IContainer = await loader.createDetachedContainer(
			provider.defaultCodeDetails,
		);
		assert.strictEqual(
			container.attachState,
			AttachState.Detached,
			"Container should be detached",
		);
		assert.strictEqual(container.closed, false, "Container should be open");
		assert.strictEqual(
			container.deltaManager.inbound.length,
			0,
			"Inbound queue should be empty",
		);
		assert.strictEqual(
			container.getQuorum().getMembers().size,
			0,
			"Quorum should not contain any members",
		);
		assert.strictEqual(
			container.connectionState,
			ConnectionState.Disconnected,
			"Container should be in disconnected state!!",
		);

		if (container.getSpecifiedCodeDetails !== undefined) {
			assert.strictEqual(
				container.getSpecifiedCodeDetails()?.package,
				provider.defaultCodeDetails.package,
				"Specified package should be same as provided",
			);
		}
		if (container.getLoadedCodeDetails !== undefined) {
			assert.strictEqual(
				container.getLoadedCodeDetails()?.package,
				provider.defaultCodeDetails.package,
				"Loaded package should be same as provided",
			);
		}
	});

	it("Attach detached container", async () => {
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
		await container.attach(request);
		assert.strictEqual(
			container.attachState,
			AttachState.Attached,
			"Container should be attached",
		);
		assert.strictEqual(container.closed, false, "Container should be open");
		assert.strictEqual(
			container.deltaManager.inbound.length,
			0,
			"Inbound queue should be empty",
		);
		const containerId = (container.resolvedUrl as IResolvedUrl).id;
		assert.ok(container, "No container ID");
		if (provider.driver.type === "local") {
			assert.strictEqual(containerId, provider.documentId, "Doc id is not matching!!");
		}
	});

	it("DataStores in detached container", async () => {
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
		// Get the root dataStore from the detached container.
		const dataStore = await getContainerEntryPointBackCompat<ITestFluidObject>(container);

		// Create a sub dataStore of type TestFluidObject and verify that it is attached.
		const subDataStore = await createFluidObject(dataStore.context, "default");
		dataStore.root.set("attachKey", subDataStore.handle);

		// Get the sub dataStore's root channel and verify that it is attached.
		const testChannel = await subDataStore.runtime.getChannel("root");
		assert.strictEqual(testChannel.isAttached(), false, "Channel should be detached!!");
		assert.strictEqual(
			subDataStore.context.attachState,
			AttachState.Detached,
			"DataStore should be detached!!",
		);
	});

	it("DataStores in attached container", async () => {
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
		// Get the root dataStore from the detached container.
		const dataStore = await getContainerEntryPointBackCompat<ITestFluidObject>(container);

		// Create a sub dataStore of type TestFluidObject.
		const testDataStore = await createFluidObject(dataStore.context, "default");
		dataStore.root.set("attachKey", testDataStore.handle);

		// Now attach the container
		await container.attach(request);

		assert(
			testDataStore.runtime.attachState !== AttachState.Detached,
			"DataStore should be attached!!",
		);

		// Get the sub dataStore's "root" channel and verify that it is attached.
		const testChannel = await testDataStore.runtime.getChannel("root");
		assert.strictEqual(testChannel.isAttached(), true, "Channel should be attached!!");

		assert.strictEqual(
			testDataStore.context.attachState,
			AttachState.Attached,
			"DataStore should be attached!!",
		);
	});

	it("can create DDS in detached container and attach / update it", async function () {
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
		const dsClient1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container);

		// Create a DDS after the root data store is created and loaded.
		const mapClient1 = SharedMap.create(dsClient1.runtime);
		dsClient1.root.set("map", mapClient1.handle);

		// Attach the container and validate that the DDS is attached.
		await container.attach(provider.driver.createCreateNewRequest(provider.documentId));
		assert(mapClient1.isAttached(), "The map should be attached after the container attaches.");
		await waitForContainerConnection(container);
		provider.updateDocumentId(container.resolvedUrl);
		const url: any = await container.getAbsoluteUrl("");
		// Load a second container and validate it can load the DDS.
		const container2 = await loader.resolve({ url });
		const dsClient2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		const mapClient2 = await dsClient2.root.get<IFluidHandle<ISharedMap>>("map")?.get();
		assert(mapClient2 !== undefined, "Map is not available in the second client");

		// Make a change in the first client's DDS and validate that the change is reflected in the second client.
		mapClient1.set("key1", "value1");
		await provider.ensureSynchronized();
		assert.strictEqual(
			mapClient2.get("key1"),
			"value1",
			"Map change not reflected in second client.",
		);

		// Make a change in the second client's DDS and validate that the change is reflected in the first client.
		mapClient2.set("key2", "value2");
		await provider.ensureSynchronized();
		assert.strictEqual(
			mapClient1.get("key2"),
			"value2",
			"Map change not reflected in first client.",
		);
	});

	it("Load attached container and check for dataStores", async () => {
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
		// Get the root dataStore from the detached container.
		const dataStore = await getContainerEntryPointBackCompat<ITestFluidObject>(container);

		// Create a sub dataStore of type TestFluidObject.
		const subDataStore1 = await createFluidObject(dataStore.context, "default");
		dataStore.root.set("attachKey", subDataStore1.handle);

		// Now attach the container and get the sub dataStore.
		await container.attach(request);

		// Now load the container from another loader.
		const loader2 = provider.makeTestLoader(testContainerConfig);
		// Create a new request url from the resolvedUrl of the first container.
		assert(container.resolvedUrl);
		const requestUrl2 = await provider.urlResolver.getAbsoluteUrl(container.resolvedUrl, "");
		const container2 = await loader2.resolve({ url: requestUrl2 });

		// Get the sub dataStore and assert that it is attached.
		const entryPoint2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		const subDataStore2Handle: IFluidHandle<ITestFluidObject> | undefined =
			entryPoint2.root.get("attachKey");
		assert(subDataStore2Handle !== undefined, "handle should exist");
		const subDataStore2 = await subDataStore2Handle.get();
		assert(
			subDataStore2.runtime.attachState !== AttachState.Detached,
			"DataStore should be attached!!",
		);

		// Verify the attributes of the root channel of both sub dataStores.
		const testChannel1 = await subDataStore1.runtime.getChannel("root");
		const testChannel2 = await subDataStore2.runtime.getChannel("root");
		assert.strictEqual(testChannel2.isAttached(), true, "Channel should be attached!!");
		assert.strictEqual(
			testChannel2.isAttached(),
			testChannel1.isAttached(),
			"Value for isAttached should persist!!",
		);

		assert.strictEqual(
			JSON.stringify(testChannel2.summarize()),
			JSON.stringify(testChannel1.summarize()),
			"Value for summarize should be same!!",
		);
	});

	it("Fire ops during container attach for shared string", async () => {
		const ops = { pos1: 0, seg: "b", type: 0 };
		const defPromise = new Deferred<void>();
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

		// Get the root dataStore from the detached container.
		const dataStore = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		const testChannel1 = await dataStore.getSharedObject<SharedString>(sharedStringId);

		dataStore.context.containerRuntime.on("op", (message, runtimeMessage) => {
			if (runtimeMessage === false) {
				return;
			}
			assert.equal(message.type, ContainerMessageType.FluidDataStoreOp);

			assert.equal(
				((message.contents as { contents: unknown }).contents as { type?: unknown }).type,
				DataStoreMessageType.ChannelOp,
			);

			assert.strictEqual(
				(
					((message.contents as { contents: unknown }).contents as { content: unknown })
						.content as { address?: unknown }
				).address,
				sharedStringId,
				"Address should be shared string",
			);
			assert.strictEqual(
				JSON.stringify(
					(
						(
							(message.contents as { contents: unknown }).contents as {
								content: unknown;
							}
						).content as { contents?: unknown }
					).contents,
				),
				JSON.stringify(ops),
				"Ops should be equal",
			);
			defPromise.resolve();
			return 0;
		});

		// Fire op before attaching the container
		testChannel1.insertText(0, "a");
		const containerP = container.attach(request);
		if (container.attachState === AttachState.Detached) {
			await timeoutPromise((resolve) => container.once("attaching", resolve));
		}

		// Fire op after the summary is taken and before it is attached.
		testChannel1.insertText(0, "b");
		await containerP;

		await defPromise.promise;
	});

	it("Fire ops during container attach for shared map", async () => {
		const ops = { key: "1", type: "set", value: { type: "Plain", value: "b" } };
		const defPromise = new Deferred<void>();
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

		// Get the root dataStore from the detached container.
		const dataStore = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		const testChannel1 = await dataStore.getSharedObject<ISharedMap>(sharedMapId);

		dataStore.context.containerRuntime.on("op", (message, runtimeMessage) => {
			if (runtimeMessage === false) {
				return;
			}
			assert.strictEqual(
				(
					((message.contents as { contents: unknown }).contents as { content: unknown })
						.content as { address?: unknown }
				).address,
				sharedMapId,
				"Address should be shared map",
			);
			assert.strictEqual(
				JSON.stringify(
					(
						(
							(message.contents as { contents: unknown }).contents as {
								content: unknown;
							}
						).content as { contents?: unknown }
					).contents,
				),
				JSON.stringify(ops),
				"Ops should be equal",
			);
			defPromise.resolve();
			return 0;
		});

		// Fire op before attaching the container
		testChannel1.set("0", "a");
		const containerP = container.attach(request);
		if (container.attachState === AttachState.Detached) {
			await timeoutPromise((resolve) => container.once("attaching", resolve));
		}

		// Fire op after the summary is taken and before it is attached.
		testChannel1.set("1", "b");
		await containerP;

		await defPromise.promise;
	});

	it("Fire channel attach ops during container attach", async () => {
		const testChannelId = "testChannel1";
		const defPromise = new Deferred<void>();
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

		// Get the root dataStore from the detached container.
		const dataStore = await getContainerEntryPointBackCompat<ITestFluidObject>(container);

		dataStore.context.containerRuntime.on("op", (message, runtimeMessage) => {
			if (runtimeMessage === false) {
				return;
			}
			assert.strictEqual(
				(
					((message.contents as { contents: unknown }).contents as { content: unknown })
						.content as { id?: unknown }
				).id,
				testChannelId,
				"Channel id should match",
			);
			assert.strictEqual(
				(
					((message.contents as { contents: unknown }).contents as { content: unknown })
						.content as { type?: unknown }
				).type,
				SharedMap.getFactory().type,
				"Channel type should match",
			);
			assert.strictEqual(
				((message.contents as { contents: unknown }).contents as { type?: unknown }).type,
				DataStoreMessageType.Attach,
				"Op should be an attach op",
			);
			defPromise.resolve();
			return 0;
		});

		const containerP = container.attach(request);
		if (container.attachState === AttachState.Detached) {
			await timeoutPromise((resolve) => container.once("attaching", resolve));
		}

		// Fire attach op
		const testChannel = dataStore.runtime.createChannel(
			testChannelId,
			SharedMap.getFactory().type,
		);
		testChannel.handle.attachGraph();
		await containerP;
		await defPromise.promise;
	});

	it("Fire dataStore attach ops during container attach", async () => {
		const testDataStoreType = "default";
		const defPromise = new Deferred<void>();
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

		// Get the root dataStore from the detached container.
		const dataStore = await getContainerEntryPointBackCompat<ITestFluidObject>(container);

		const containerP = container.attach(request);
		if (container.attachState === AttachState.Detached) {
			await timeoutPromise((resolve) => container.once("attaching", resolve));
		}

		const newDataStore = await dataStore.context.containerRuntime.createDataStore([
			testDataStoreType,
		]);
		const comp2 = await getDataStoreEntryPointBackCompat<ITestFluidObject>(newDataStore);

		dataStore.context.containerRuntime.on("op", (message, runtimeMessage) => {
			if (runtimeMessage === false) {
				return;
			}
			try {
				assert.strictEqual(
					message.type,
					ContainerMessageType.Attach,
					"Op should be an attach op",
				);
				assert.strictEqual(
					(message.contents as { id?: unknown }).id,
					comp2.context.id,
					"DataStore id should match",
				);
				assert.strictEqual(
					(message.contents as { type?: unknown }).type,
					testDataStoreType,
					"DataStore type should match",
				);
				defPromise.resolve();
			} catch (e) {
				defPromise.reject(e);
			}
			return 0;
		});

		// Fire attach op
		dataStore.root.set("attachComp", comp2.handle);
		await containerP;
		await defPromise.promise;
	});

	it("Fire ops during container attach for consensus register collection", async () => {
		const op = {
			key: "1",
			type: "write",
			serializedValue: JSON.stringify("b"),
			value: {
				type: "Plain",
				value: "b",
			},
			refSeq: detachedContainerRefSeqNumber,
		};
		const defPromise = new Deferred<void>();
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

		// Get the root dataStore from the detached container.
		const dataStore = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		const testChannel1 =
			await dataStore.getSharedObject<ConsensusRegisterCollection<string>>(crcId);

		dataStore.context.containerRuntime.on("op", (message, runtimeMessage) => {
			if (runtimeMessage === false) {
				return;
			}
			assert.strictEqual(
				(
					((message.contents as { contents: unknown }).contents as { content: unknown })
						.content as { address?: unknown }
				).address,
				crcId,
				"Address should be consensus register collection",
			);
			const receivedOp = (
				(
					(message.contents as { contents: unknown }).contents as {
						content: unknown;
					}
				).content as { contents?: unknown }
			).contents as any;
			assert.strictEqual(op.key, receivedOp.key, "Op key should be same");
			assert.strictEqual(op.type, receivedOp.type, "Op type should be same");
			assert.strictEqual(
				op.serializedValue,
				receivedOp.serializedValue,
				"Op serializedValue should be same",
			);
			assert.strictEqual(op.refSeq, receivedOp.refSeq, "Op refSeq should be same");
			if (receivedOp.value) {
				assert.deepEqual(op.value, receivedOp.value, "Op value should be same");
			}
			defPromise.resolve();
			return 0;
		});

		// Fire op before attaching the container
		await testChannel1.write("0", "a");
		const containerP = container.attach(request);
		if (container.attachState === AttachState.Detached) {
			await timeoutPromise((resolve) => container.once("attaching", resolve));
		}

		// Fire op after the summary is taken and before it is attached.
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		testChannel1.write("1", "b");
		await containerP;
		await defPromise.promise;
	});

	it("Fire ops during container attach for shared directory", async () => {
		const op = {
			key: "1",
			path: "/",
			type: "set",
			value: { type: "Plain", value: "b" },
		};
		const defPromise = new Deferred<void>();
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

		// Get the root dataStore from the detached container.
		const dataStore = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		const testChannel1 = await dataStore.getSharedObject<SharedDirectory>(sharedDirectoryId);

		dataStore.context.containerRuntime.on("op", (message, runtimeMessage) => {
			if (runtimeMessage === false) {
				return;
			}
			assert.strictEqual(
				(
					((message.contents as { contents: unknown }).contents as { content: unknown })
						.content as { address?: unknown }
				).address,
				sharedDirectoryId,
				"Address should be shared directory",
			);
			assert.strictEqual(
				JSON.stringify(
					(
						(
							(message.contents as { contents: unknown }).contents as {
								content: unknown;
							}
						).content as { contents?: unknown }
					).contents,
				),
				JSON.stringify(op),
				"Op should be same",
			);
			defPromise.resolve();
			return 0;
		});

		// Fire op before attaching the container
		testChannel1.set("0", "a");
		const containerP = container.attach(request);
		if (container.attachState === AttachState.Detached) {
			await timeoutPromise((resolve) => container.once("attaching", resolve));
		}

		// Fire op after the summary is taken and before it is attached.
		testChannel1.set("1", "b");
		await containerP;
		await defPromise.promise;
	});

	it("Fire ops during container attach for shared cell", async () => {
		const op = { type: "setCell", value: { value: "b" } };
		const defPromise = new Deferred<void>();
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

		// Get the root dataStore from the detached container.
		const dataStore = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		const testChannel1 = await dataStore.getSharedObject<SharedCell>(sharedCellId);

		dataStore.context.containerRuntime.on("op", (message, runtimeMessage) => {
			if (runtimeMessage === false) {
				return;
			}
			assert.strictEqual(
				(
					((message.contents as { contents: unknown }).contents as { content: unknown })
						.content as { address?: unknown }
				).address,
				sharedCellId,
				"Address should be shared directory",
			);
			assert.strictEqual(
				JSON.stringify(
					(
						(
							(message.contents as { contents: unknown }).contents as {
								content: unknown;
							}
						).content as { contents?: unknown }
					).contents,
				),
				JSON.stringify(op),
				"Op should be same",
			);
			defPromise.resolve();
			return 0;
		});

		// Fire op before attaching the container
		testChannel1.set("a");
		const containerP = container.attach(request);
		if (container.attachState === AttachState.Detached) {
			await timeoutPromise((resolve) => container.once("attaching", resolve));
		}

		// Fire op after the summary is taken and before it is attached.
		testChannel1.set("b");
		await containerP;
		await defPromise.promise;
	});

	it("Fire ops during container attach for consensus ordered collection", async () => {
		const op = { opName: "add", value: JSON.stringify("s"), deserializedValue: "s" };
		const defPromise = new Deferred<void>();
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

		// Get the root dataStore from the detached container.
		const dataStore = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		const testChannel1 = await dataStore.getSharedObject<ConsensusQueue>(cocId);

		dataStore.context.containerRuntime.on("op", (message, runtimeMessage) => {
			if (runtimeMessage === false) {
				return;
			}
			assert.strictEqual(
				(
					((message.contents as { contents: unknown }).contents as { content: unknown })
						.content as { address?: unknown }
				).address,
				cocId,
				"Address should be consensus queue",
			);
			const receivedOp = (
				(
					(message.contents as { contents: unknown }).contents as {
						content: unknown;
					}
				).content as { contents?: unknown }
			).contents as any;
			assert.strictEqual(op.opName, receivedOp.opName, "Op name should be same");
			assert.strictEqual(op.value, receivedOp.value, "Op value should be same");
			if (receivedOp.deserializedValue) {
				assert.strictEqual(
					op.deserializedValue,
					receivedOp.deserializedValue,
					"Op deserializedValue should be same",
				);
			}
			defPromise.resolve();
			return 0;
		});

		// Fire op before attaching the container
		await testChannel1.add("a");
		const containerP = container.attach(request);
		if (container.attachState === AttachState.Detached) {
			await timeoutPromise((resolve) => container.once("attaching", resolve));
		}

		// Fire op after the summary is taken and before it is attached.
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		testChannel1.add("s");

		await containerP;
		await defPromise.promise;
	});

	it("Fire ops during container attach for sparse matrix", async () => {
		const seg = { items: ["s"] };
		const defPromise = new Deferred<void>();
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

		// Get the root dataStore from the detached container.
		const dataStore = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		const testChannel1 = await dataStore.getSharedObject<SparseMatrix>(sparseMatrixId);

		dataStore.context.containerRuntime.on("op", (message, runtimeMessage) => {
			try {
				if (runtimeMessage === false) {
					return;
				}

				const envelope = (message.contents as any).contents.content;
				assert.strictEqual(
					envelope.address,
					sparseMatrixId,
					"Address should be sparse matrix",
				);
				if (envelope.contents.type === MergeTreeDeltaType.INSERT) {
					assert.strictEqual(
						JSON.stringify(envelope.contents.seg),
						JSON.stringify(seg),
						"Seg should be same",
					);
				}
				defPromise.resolve();
			} catch (e) {
				defPromise.reject(e);
			}
		});

		// Fire op before attaching the container
		testChannel1.insertRows(0, 1);
		testChannel1.insertCols(0, 1);
		const containerP = container.attach(request);
		if (container.attachState === AttachState.Detached) {
			await timeoutPromise((resolve) => container.once("attaching", resolve));
		}

		// Fire op after the summary is taken and before it is attached.
		testChannel1.setItems(0, 0, seg.items);

		await containerP;
		await defPromise.promise;
	});

	it.skip("Fire ops during container attach for shared matrix", async () => {
		const op = { pos1: 0, seg: 9, type: 0, target: "rows" };
		const defPromise = new Deferred<void>();
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

		// Get the root dataStore from the detached container.
		const dataStore = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		const testChannel1 = await dataStore.getSharedObject<SharedMatrix>(sharedMatrixId);

		dataStore.context.containerRuntime.on("op", (message, runtimeMessage) => {
			if (runtimeMessage === false) {
				return;
			}
			assert.strictEqual(
				(
					((message.contents as { contents: unknown }).contents as { content: unknown })
						.content as { address?: unknown }
				).address,
				sharedMatrixId,
				"Address should be shared matrix",
			);
			assert.strictEqual(
				JSON.stringify(
					(
						(
							(message.contents as { contents: unknown }).contents as {
								content: unknown;
							}
						).content as { contents?: unknown }
					).contents,
				),
				JSON.stringify(op),
				"Op should be same",
			);
			defPromise.resolve();
			return 0;
		});

		// Fire op before attaching the container
		testChannel1.insertRows(0, 20);
		testChannel1.insertCols(0, 20);
		const containerP = container.attach(request);
		if (container.attachState === AttachState.Detached) {
			await timeoutPromise((resolve) => container.once("attaching", resolve));
		}

		// Fire op after the summary is taken and before it is attached.
		testChannel1.insertRows(0, 9);

		await containerP;
		await defPromise.promise;
	});
});

// Review: Run with Full Compat?
describeCompat("Detached Container", "NoCompat", (getTestObjectProvider, apis) => {
	const {
		SharedString,
		SharedMap,
		ConsensusRegisterCollection,
		SharedDirectory,
		SharedCell,
		SharedMatrix,
		ConsensusQueue,
		SparseMatrix,
	} = apis.dds;

	const registry: ChannelFactoryRegistry = [
		[sharedStringId, SharedString.getFactory()],
		[sharedMapId, SharedMap.getFactory()],
		[crcId, ConsensusRegisterCollection.getFactory()],
		[sharedDirectoryId, SharedDirectory.getFactory()],
		[sharedCellId, SharedCell.getFactory()],
		[sharedMatrixId, SharedMatrix.getFactory()],
		[cocId, ConsensusQueue.getFactory()],
		[sparseMatrixId, SparseMatrix.getFactory()],
	];

	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	let request: IRequest;
	let loader: Loader;

	beforeEach("setup", () => {
		provider = getTestObjectProvider();
		request = provider.driver.createCreateNewRequest(provider.documentId);
		loader = provider.makeTestLoader(testContainerConfig) as Loader;
	});

	it("Retry attaching detached container", async () => {
		let retryTimes = 1;
		const documentServiceFactory: IDocumentServiceFactory = {
			...provider.documentServiceFactory,
			createContainer: async (createNewSummary, createNewResolvedUrl, logger) => {
				if (retryTimes > 0) {
					retryTimes -= 1;
					const error = new Error("Test Error");
					(error as any).canRetry = true;
					throw error;
				}
				return provider.documentServiceFactory.createContainer(
					createNewSummary,
					createNewResolvedUrl,
					logger,
				);
			},
		};

		const fluidExport: SupportedExportInterfaces = {
			IFluidDataStoreFactory: new TestFluidObjectFactory(registry),
		};
		const codeLoader = new LocalCodeLoader([[provider.defaultCodeDetails, fluidExport]]);
		const mockLoader = new Loader({
			urlResolver: provider.urlResolver,
			documentServiceFactory,
			codeLoader,
			logger: createChildLogger(),
		});

		const container = await mockLoader.createDetachedContainer(provider.defaultCodeDetails);
		await container.attach(request);
		assert.strictEqual(
			container.attachState,
			AttachState.Attached,
			"Container should be attached",
		);
		assert.strictEqual(container.closed, false, "Container should be open");
		assert.strictEqual(
			container.deltaManager.inbound.length,
			0,
			"Inbound queue should be empty",
		);
		const containerId = (container.resolvedUrl as IResolvedUrl).id;
		assert.ok(containerId, "No container ID");
		if (provider.driver.type === "local") {
			assert.strictEqual(containerId, provider.documentId, "Doc id is not matching!!");
		}
		assert.strictEqual(retryTimes, 0, "Should not succeed at first time");
	}).timeout(5000);

	itExpects(
		"Container should not be closed on network failure during attach and succeed on retry",
		[],
		async () => {
			const loaderWithConfig = provider.createLoader(
				[[provider.defaultCodeDetails, provider.createFluidEntryPoint()]],
				{
					configProvider: {
						getRawConfig: (name) =>
							name === "Fluid.Container.RetryOnAttachFailure" ? true : undefined,
					},
				},
			);

			const container = await loaderWithConfig.createDetachedContainer(
				provider.defaultCodeDetails,
			);

			const oldFunc = provider.documentServiceFactory.createContainer;
			provider.documentServiceFactory.createContainer = (a, b, c) => {
				throw new Error("Test Error");
			};
			try {
				await container.attach(request);
				assert.fail("expected attach to fail!");
			} catch (e) {
				provider.documentServiceFactory.createContainer = oldFunc;
			}
			assert.strictEqual(container.closed, false, "Container should not be closed");

			await container.attach(request);

			assert.strictEqual(container.closed, false, "Container should not be closed");
		},
	);

	itExpects("Attach can be called multiple times with the same parameters", [], async () => {
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

		const attaches: [Promise<void>, Promise<void>] = [
			container.attach(request),
			container.attach(request),
		];

		assert.strictEqual(attaches[0], attaches[1], "promises should match for parallel calls");

		await Promise.all(attaches);
		assert.strictEqual(container.closed, false, "Container should not be closed");
	});

	itExpects("Attach can't be called multiple times with different parameters", [], async () => {
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

		const attachP = container.attach(request);

		// the second should fail, as the arguments don't match
		try {
			await container.attach({ ...request });
			assert.fail("should fail");
		} catch (e) {
			assert(isFluidError(e), "should be a Fluid error");
			assert.equal(e.message, "Subsequent calls cannot use different arguments.");
		}

		await attachP;

		assert.strictEqual(container.closed, false, "Container should not be closed");
	});
	itExpects(
		"Container should be closed when runtime.createSummary fails during attach",
		[
			{
				eventName: "fluid:telemetry:Container:ContainerClose",
				error: "runtime.createSummary failed!",
			},
		],
		async () => {
			const loaderWithBadRuntime = provider.createLoader(
				new Map([
					[
						provider.defaultCodeDetails,
						{
							IRuntimeFactory: {
								get IRuntimeFactory() {
									return this;
								},
								instantiateRuntime: async (context, existing) => {
									const entrypoint = provider.createFluidEntryPoint();
									const runtimeFactory: FluidObject<IRuntimeFactory> =
										"fluidExport" in entrypoint
											? entrypoint.fluidExport
											: entrypoint;

									assert(
										runtimeFactory.IRuntimeFactory,
										"entrypoint is not runtime factory",
									);

									const runtime =
										await runtimeFactory.IRuntimeFactory.instantiateRuntime(
											context,
											existing,
										);

									return wrapObjectAndOverride<IRuntime>(runtime, {
										createSummary: () => () => {
											assert.fail("runtime.createSummary failed!");
										},
									});
								},
							},
						},
					],
				]),
			);
			const container = await loaderWithBadRuntime.createDetachedContainer(
				provider.defaultCodeDetails,
			);
			try {
				await container.attach(request);
				assert.fail("expected attach to fail!");
			} catch (e) {}
			assert.strictEqual(container.closed, true, "Container should be closed");
		},
	);
	itExpects(
		"Container should be closed when runtime.setAttachState fails during attach",
		[
			{
				eventName: "fluid:telemetry:Container:ContainerClose",
				error: "runtime.setAttachState failed!",
			},
		],
		async () => {
			const loaderWithBadRuntime = provider.createLoader(
				new Map([
					[
						provider.defaultCodeDetails,
						{
							IRuntimeFactory: {
								get IRuntimeFactory() {
									return this;
								},
								instantiateRuntime: async (context, existing) => {
									const entrypoint = provider.createFluidEntryPoint();
									const runtimeFactory: FluidObject<IRuntimeFactory> =
										"fluidExport" in entrypoint
											? entrypoint.fluidExport
											: entrypoint;

									assert(
										runtimeFactory.IRuntimeFactory,
										"entrypoint is not runtime factory",
									);

									const runtime =
										await runtimeFactory.IRuntimeFactory.instantiateRuntime(
											context,
											existing,
										);

									return wrapObjectAndOverride<IRuntime>(runtime, {
										setAttachState: () => () => {
											assert.fail("runtime.setAttachState failed!");
										},
									});
								},
							},
						},
					],
				]),
			);
			const container = await loaderWithBadRuntime.createDetachedContainer(
				provider.defaultCodeDetails,
			);
			try {
				await container.attach(request);
				assert.fail("expected attach to fail!");
			} catch (e) {}
			assert.strictEqual(container.closed, true, "Container should be closed");
		},
	);
	itExpects(
		"Container should be closed on failed attach with non retryable error",
		[{ eventName: "fluid:telemetry:Container:ContainerClose", error: "Test Error" }],
		async () => {
			const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

			const oldFunc = provider.documentServiceFactory.createContainer;
			provider.documentServiceFactory.createContainer = (a, b, c) => {
				throw new Error("Test Error");
			};
			let failedOnce = false;
			try {
				await container.attach(request);
			} catch (e) {
				failedOnce = true;
				provider.documentServiceFactory.createContainer = oldFunc;
			}
			assert.strictEqual(failedOnce, true, "Attach call should fail");
			assert.strictEqual(container.closed, true, "Container should be closed");
		},
	);
});
