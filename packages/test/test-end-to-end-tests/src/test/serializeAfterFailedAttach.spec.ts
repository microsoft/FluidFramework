/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions/internal";
import {
	ITestFluidObject,
	ITestObjectProvider,
	LocalCodeLoader,
	TestFluidObject,
	TestFluidObjectFactory,
	createDocumentId,
} from "@fluidframework/test-utils/internal";

import { wrapObjectAndOverride } from "../mocking.js";

describeCompat(
	`Serialize After Failure to Attach Container Test`,
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { SharedMap, SharedString } = apis.dds;

		const codeDetails: IFluidCodeDetails = {
			package: "detachedContainerTestPackage1",
			config: {},
		};
		const sharedStringId = "ss1Key";
		const sharedMapId = "sm1Key";
		async function createAttachingContainerAndGetEntryPoint(provider: ITestObjectProvider) {
			const documentId = createDocumentId();
			const request = provider.driver.createCreateNewRequest(documentId);
			const loader = createTestLoader(
				provider,
				wrapObjectAndOverride<IDocumentServiceFactory>(provider.documentServiceFactory, {
					createContainer: () => assert.fail("fail on attach"),
				}),
			);

			const container: IContainer = await loader.createDetachedContainer(codeDetails);
			// Get the root dataStore from the detached container.
			const defaultDataStore = (await container.getEntryPoint()) as TestFluidObject;

			// Attempt to attach the container, then validate the attaching state
			await container.attach(request).then(
				() => assert.fail("should fail"),
				() => {},
			);
			assert.equal(
				container.attachState,
				AttachState.Attaching,
				"Container should be attaching",
			);
			return {
				container,
				defaultDataStore,
			};
		}

		function createTestLoader(
			provider: ITestObjectProvider,
			documentServiceFactory?: IDocumentServiceFactory,
		): Loader {
			const factory: TestFluidObjectFactory = new TestFluidObjectFactory([
				[sharedStringId, SharedString.getFactory()],
				[sharedMapId, SharedMap.getFactory()],
			]);
			const codeLoader = new LocalCodeLoader([[codeDetails, factory]], {});
			const testLoader = new Loader({
				urlResolver: provider.urlResolver,
				documentServiceFactory: documentServiceFactory ?? provider.documentServiceFactory,
				codeLoader,
				logger: provider.logger,
				configProvider: {
					getRawConfig: (name) =>
						name === "Fluid.Container.RetryOnAttachFailure" ? true : undefined,
				},
			});
			return testLoader;
		}

		const createPeerDataStore = async (containerRuntime: IContainerRuntimeBase) => {
			const dataStore = await containerRuntime.createDataStore(["default"]);
			const peerDataStore = (await dataStore.entryPoint.get()) as ITestFluidObject;
			return {
				peerDataStore,
				peerDataStoreRuntimeChannel: peerDataStore.channel,
			};
		};

		for (const attachAfterRehydrate of [true, false]) {
			it(`Can serialize and rehydrate attaching container with no additional changes. attachAfterRehydrate: ${attachAfterRehydrate}`, async () => {
				const provider = getTestObjectProvider();

				const { container } = await createAttachingContainerAndGetEntryPoint(provider);

				const snapshotTree = container.serialize();

				const loader = createTestLoader(provider);

				const rehydratedContainer =
					await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

				if (attachAfterRehydrate) {
					await rehydratedContainer.attach(provider.driver.createCreateNewRequest());
					assert.strictEqual(rehydratedContainer.attachState, AttachState.Attached);
				}

				// Check for default data store
				const entryPoint = await rehydratedContainer.getEntryPoint();
				assert.notStrictEqual(entryPoint, undefined, "Component should exist!");
			});
			it(`Can serialize and rehydrate attaching container with newly created data stores. attachAfterRehydrate: ${attachAfterRehydrate}`, async () => {
				const provider = getTestObjectProvider();

				// create a detached container and attempt to attach
				const { container, defaultDataStore } =
					await createAttachingContainerAndGetEntryPoint(provider);

				// create a new data store
				const peerDataStore = await createPeerDataStore(
					defaultDataStore.context.containerRuntime,
				);
				const dataStore2 = peerDataStore.peerDataStore;
				const rootOfDataStore1 =
					await defaultDataStore.getSharedObject<ISharedMap>(sharedMapId);
				const dataStore2Key = "dataStore2";
				// attach a new data store
				rootOfDataStore1.set(dataStore2Key, dataStore2.handle);

				// serialize and rehydrate
				const snapshotTree = container.serialize();

				const loader = createTestLoader(provider);

				const rehydratedContainer =
					await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

				if (attachAfterRehydrate) {
					await rehydratedContainer.attach(provider.driver.createCreateNewRequest());
					assert.strictEqual(rehydratedContainer.attachState, AttachState.Attached);
				}

				const rehydratedEntryPoint =
					(await rehydratedContainer.getEntryPoint()) as TestFluidObject;
				const rehydratedRootOfDataStore =
					await rehydratedEntryPoint.getSharedObject<ISharedMap>(sharedMapId);

				const dataStore2Handle: IFluidHandle<TestFluidObject> | undefined =
					rehydratedRootOfDataStore.get(dataStore2Key);

				// validate data store
				assert(dataStore2Handle !== undefined, `handle for [${dataStore2Key}] must exist`);
				const dataStore2FromRC = await dataStore2Handle.get();
				assert(dataStore2FromRC, "DataStore2 should have been serialized properly");
				assert.strictEqual(
					dataStore2FromRC.runtime.id,
					dataStore2.runtime.id,
					"DataStore2 id should match",
				);
			});
			it(`Can serialize and rehydrate attaching container with newly created DDS. attachAfterRehydrate: ${attachAfterRehydrate}`, async () => {
				const provider = getTestObjectProvider();

				// create a detached container and attempt to attach
				const { container, defaultDataStore } =
					await createAttachingContainerAndGetEntryPoint(provider);

				// create a new dds
				const ddsId = "notbounddds";
				const dds2 = defaultDataStore.runtime.createChannel(
					ddsId,
					SharedString.getFactory().type,
				);

				const rootOfDataStore1 =
					await defaultDataStore.getSharedObject<ISharedMap>(sharedMapId);
				const dds2Key = "dds2";
				// attach a new dds
				rootOfDataStore1.set(dds2Key, dds2.handle);

				// serialize and rehydrate
				const snapshotTree = container.serialize();

				const loader = createTestLoader(provider);

				const rehydratedContainer =
					await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

				if (attachAfterRehydrate) {
					await rehydratedContainer.attach(provider.driver.createCreateNewRequest());
					assert.strictEqual(rehydratedContainer.attachState, AttachState.Attached);
				}

				const rehydratedEntryPoint =
					(await rehydratedContainer.getEntryPoint()) as TestFluidObject;
				const rootOfDds2 = await rehydratedEntryPoint.getSharedObject<ISharedMap>(sharedMapId);
				const dds2Handle: IFluidHandle<ISharedMap> | undefined = rootOfDds2.get(dds2Key);

				// validate dds
				assert(dds2Handle !== undefined, `handle for [${dds2Key}] must exist`);
				const dds2FromRC = await dds2Handle.get();
				assert(dds2FromRC, "DDS2 should have been serialized properly");
				assert.strictEqual(dds2FromRC.id, ddsId, "DDS id should match");
				assert.strictEqual(dds2FromRC.id, dds2.id, "Both DDS id should match");
			});
			it(`Can serialize and rehydrate attaching container with newly created data store and DDS. attachAfterRehydrate: ${attachAfterRehydrate}`, async () => {
				const provider = getTestObjectProvider();

				// create a detached container and attempt to attach
				const { container, defaultDataStore } =
					await createAttachingContainerAndGetEntryPoint(provider);

				// create a new data store
				const peerDataStore = await createPeerDataStore(
					defaultDataStore.context.containerRuntime,
				);
				const dataStore2 = peerDataStore.peerDataStore;

				// create a new dds
				const ddsId = "notbounddds";
				const dds2 = dataStore2.runtime.createChannel(ddsId, SharedString.getFactory().type);

				// attach the new data store and dds
				const dds2Key = "dds2";
				const dataStore2Key = "dataStore2";
				const rootOfDataStore1 =
					await defaultDataStore.getSharedObject<ISharedMap>(sharedMapId);
				rootOfDataStore1.set(dataStore2Key, dataStore2.handle);
				rootOfDataStore1.set(dds2Key, dds2.handle);

				// serialize and rehydrate
				const snapshotTree = container.serialize();

				const loader = createTestLoader(provider);

				const rehydratedContainer =
					await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

				if (attachAfterRehydrate) {
					await rehydratedContainer.attach(provider.driver.createCreateNewRequest());
					assert.strictEqual(rehydratedContainer.attachState, AttachState.Attached);
				}

				const rehydratedEntryPoint =
					(await rehydratedContainer.getEntryPoint()) as TestFluidObject;
				const rehydratedRoot =
					await rehydratedEntryPoint.getSharedObject<ISharedMap>(sharedMapId);
				const dataStore2Handle: IFluidHandle<TestFluidObject> | undefined =
					rehydratedRoot.get(dataStore2Key);
				const dds2Handle: IFluidHandle<ISharedMap> | undefined = rehydratedRoot.get(dds2Key);

				// validate data store
				assert(dataStore2Handle !== undefined, `handle for [${dataStore2Key}] must exist`);
				const dataStore2FromRC = await dataStore2Handle.get();
				assert(dataStore2FromRC, "DataStore2 should have been serialized properly");
				assert.strictEqual(
					dataStore2FromRC.runtime.id,
					dataStore2.runtime.id,
					"DataStore2 id should match",
				);

				// validate dds
				assert(dds2Handle !== undefined, `handle for [${dds2Key}] must exist`);
				const dds2FromRC = await dds2Handle.get();
				assert(dds2FromRC, "DDS2 should have been serialized properly");
				assert.strictEqual(dds2FromRC.id, ddsId, "DDS id should match");
				assert.strictEqual(dds2FromRC.id, dds2.id, "Both DDS id should match");
			});
		}
	},
);
