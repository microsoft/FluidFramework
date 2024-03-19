/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as semver from "semver";
import { AttachState, IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import {
	LocalCodeLoader,
	TestFluidObjectFactory,
	ITestFluidObject,
	TestFluidObject,
	createDocumentId,
	LoaderContainerTracker,
	ITestObjectProvider,
} from "@fluidframework/test-utils";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { describeCompat } from "@fluid-private/test-version-utils";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import type { ISharedMap } from "@fluidframework/map";
import { wrapObjectAndOverride } from "../mocking.js";

describeCompat(
	`Serialize After Failure to Attach Container Test`,
	"FullCompat",
	(getTestObjectProvider, apis) => {
		const { SharedMap, SharedString } = apis.dds;

		const codeDetails: IFluidCodeDetails = {
			package: "detachedContainerTestPackage1",
			config: {},
		};
		const sharedStringId = "ss1Key";
		const sharedMapId = "sm1Key";

		let provider: ITestObjectProvider;
		let loader: Loader;
		let request: IRequest;
		const loaderContainerTracker = new LoaderContainerTracker();

		async function createDetachedContainerAndGetEntryPoint() {
			const container: IContainer = await loader.createDetachedContainer(codeDetails);
			// Get the root dataStore from the detached container.
			const defaultDataStore = (await container.getEntryPoint()) as TestFluidObject;
			return {
				container,
				defaultDataStore,
			};
		}

		function createTestLoader(): Loader {
			const factory: TestFluidObjectFactory = new TestFluidObjectFactory([
				[sharedStringId, SharedString.getFactory()],
				[sharedMapId, SharedMap.getFactory()],
			]);
			const codeLoader = new LocalCodeLoader([[codeDetails, factory]], {});
			const testLoader = new Loader({
				urlResolver: provider.urlResolver,
				documentServiceFactory: wrapObjectAndOverride<IDocumentServiceFactory>(
					provider.documentServiceFactory,
					{
						createContainer: () => assert.fail("fail on attach"),
					},
				),
				codeLoader,
				logger: provider.logger,
				configProvider: {
					getRawConfig: (name) =>
						name === "Fluid.Container.RetryOnAttachFailure" ? true : undefined,
				},
			});
			loaderContainerTracker.add(testLoader);
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

		beforeEach("createLoader", async function () {
			provider = getTestObjectProvider();
			if (
				semver.compare(provider.driver.version, "0.46.0") === -1 &&
				(provider.driver.type === "routerlicious" || provider.driver.type === "tinylicious")
			) {
				this.skip();
			}
			const documentId = createDocumentId();
			request = provider.driver.createCreateNewRequest(documentId);
			loader = createTestLoader();
		});

		afterEach("resetLoaderContainerTracker", () => {
			loaderContainerTracker.reset();
		});

		const tests = () => {
			it("Can serialize detached container", async () => {
				const { container } = await createDetachedContainerAndGetEntryPoint();

				const snapshotTree = container.serialize();

				const container2 =
					await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

				// Check for default data store
				const entryPoint = await container2.getEntryPoint();
				assert.notStrictEqual(entryPoint, undefined, "Component should exist!");
				// Might need some other asserts, but not sure what
			});
			it("Can serialize detached container with data stores after failed attach", async () => {
				const { container, defaultDataStore } =
					await createDetachedContainerAndGetEntryPoint();

				// go into attaching state
				await container.attach(request).then(
					() => assert.fail("should fail"),
					() => {},
				);
				assert.equal(
					container.attachState,
					AttachState.Attaching,
					"Container should be attaching",
				);

				// create a new data store
				const peerDataStore = await createPeerDataStore(
					defaultDataStore.context.containerRuntime,
				);
				const dataStore2 = peerDataStore.peerDataStore as TestFluidObject;
				const rootOfDataStore1 =
					await defaultDataStore.getSharedObject<ISharedMap>(sharedMapId);
				const dataStore2Key = "dataStore2";
				// attach a new data store
				rootOfDataStore1.set(dataStore2Key, dataStore2.handle);

				// serialize and rehydrate
				const snapshotTree = container.serialize();
				const rehydratedContainer =
					await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

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
			it("Can serialize detached container with DDS after failed attach", async () => {
				const { container, defaultDataStore } =
					await createDetachedContainerAndGetEntryPoint();

				// go into attaching state
				await container.attach(request).then(
					() => assert.fail("should fail"),
					() => {},
				);
				assert.equal(
					container.attachState,
					AttachState.Attaching,
					"Container should be attaching",
				);

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
				const rehydratedContainer =
					await loader.rehydrateDetachedContainerFromSnapshot(snapshotTree);

				const rehydratedEntryPoint =
					(await rehydratedContainer.getEntryPoint()) as TestFluidObject;
				const rootOfDds2 =
					await rehydratedEntryPoint.getSharedObject<ISharedMap>(sharedMapId);
				const dds2Handle: IFluidHandle<ISharedMap> | undefined = rootOfDds2.get(dds2Key);

				// validate data store
				assert(dds2Handle !== undefined, `handle for [${dds2Key}] must exist`);
				const dds2FromRC = await dds2Handle.get();
				assert(dds2FromRC, "DDS2 should have been serialized properly");
				assert.strictEqual(dds2FromRC.id, ddsId, "DDS id should match");
				assert.strictEqual(dds2FromRC.id, dds2.id, "Both DDS id should match");
			});
		};

		// Run once with isolated channels
		tests();
	},
);
