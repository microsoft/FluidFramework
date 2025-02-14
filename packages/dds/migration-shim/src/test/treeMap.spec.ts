/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { LocalServerTestDriver } from "@fluid-private/test-drivers";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import type { IChannelServices } from "@fluidframework/datastore-definitions/internal";
import {
	SharedDirectory,
	SharedMap,
	type ISharedDirectory,
	type ISharedMap,
} from "@fluidframework/map/internal";
import type { ISharedObjectKind } from "@fluidframework/shared-object-base/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import {
	type ChannelFactoryRegistry,
	type ITestFluidObject,
	TestContainerRuntimeFactory,
	TestFluidObjectFactory,
	TestObjectProvider,
	type fluidEntryPoint,
} from "@fluidframework/test-utils/internal";
import { TreeViewConfiguration, type ITree } from "@fluidframework/tree/internal";

import { MigrationStatus, shimInfo, type IMigrationShim } from "../shim.js";
import { MapAdapterRoot, MapToTree, TreeFromMap } from "../treeMap.js";

describe("treeMap", () => {
	it("conversion", () => {
		// const dataStoreRuntime = new MockFluidDataStoreRuntime({
		// 	registry: [SharedMap.getFactory()],
		// });
		// const map = SharedMap.create(dataStoreRuntime, id);
		// return map;
	});

	it.skip("collab", async () => {
		const containerRuntimeFactory: MockContainerRuntimeFactory =
			new MockContainerRuntimeFactory();

		// A

		const dataStoreRuntimeA = new MockFluidDataStoreRuntime({
			registry: [SharedMap.getFactory()],
		});
		const containerRuntimeA =
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntimeA);
		const servicesA: IChannelServices = {
			deltaConnection: dataStoreRuntimeA.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};

		const mapA = SharedMap.create(dataStoreRuntimeA, "TestMap");
		mapA.connect(servicesA);

		mapA.set("K", "V");
		containerRuntimeFactory.processAllMessages();

		// B

		const dataStoreRuntimeB = new MockFluidDataStoreRuntime({
			registry: [MapToTree.getFactory()],
		});
		const containerRuntimeB =
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntimeB);
		const servicesB: IChannelServices = {
			deltaConnection: dataStoreRuntimeB.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};

		const channelB = await dataStoreRuntimeB.getChannel("TestMap");
		channelB.connect(servicesB);
		const mapB = channelB as ISharedMap & IMigrationShim;

		assert.equal(mapB.get("K"), "V");

		await dataStoreRuntimeA.close();

		// C

		const dataStoreRuntimeC = new MockFluidDataStoreRuntime({
			registry: [TreeFromMap.getFactory()],
		});
		const containerRuntimeC =
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntimeC);
		const servicesC: IChannelServices = {
			deltaConnection: dataStoreRuntimeC.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};

		const channelC = await dataStoreRuntimeC.getChannel("TestMap");
		channelC.connect(servicesC);
		const mapC = channelC as unknown as ITree & IMigrationShim;
		const config = new TreeViewConfiguration({
			schema: MapAdapterRoot,
			enableSchemaValidation: true,
			preventAmbiguity: true,
		});

		const view = mapC.viewWith(config);

		assert.equal(view.root.get("K")?.json, "V");
	});

	it("collab minimal", async () => {
		const driver = new LocalServerTestDriver();
		const mapId = "TestMap";

		const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];

		const containerRuntimeFactory = (): fluidEntryPoint =>
			new TestContainerRuntimeFactory(
				"@fluid-example/test-dataStore",
				new TestFluidObjectFactory(registry),
			);

		const objProvider = new TestObjectProvider(Loader, driver, containerRuntimeFactory);
		const _initial = await objProvider.makeTestContainer();
		// initial.close();

		async function connect(): Promise<{
			container: IContainer;
			sharedObject: ISharedMap;
		}> {
			const container = await objProvider.loadTestContainer();
			const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			const sharedObject = await dataObject.getSharedObject<ISharedMap>(mapId);
			return { container, sharedObject };
		}

		const a = await connect();
		const b = await connect();

		assert(a.sharedObject.isAttached());
		assert(b.sharedObject.isAttached());

		a.sharedObject.set("K", "V");
		await objProvider.ensureSynchronized();
		assert.equal(a.sharedObject.get("K"), "V");
		assert.equal(b.sharedObject.get("K"), "V");
	});

	it("collab minimal2", async () => {
		const driver = new LocalServerTestDriver();
		const mapId = "TestMap";

		const registry: ChannelFactoryRegistry = [[mapId, SharedDirectory.getFactory()]];

		const containerRuntimeFactory = (): fluidEntryPoint =>
			new TestContainerRuntimeFactory(
				"@fluid-example/test-dataStore",
				new TestFluidObjectFactory(registry),
			);

		const objProvider = new TestObjectProvider(Loader, driver, containerRuntimeFactory);
		const _initial = await objProvider.makeTestContainer();
		// initial.close();

		async function connect(): Promise<{
			container: IContainer;
			sharedObject: ISharedDirectory;
		}> {
			const container = await objProvider.loadTestContainer();
			const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			const sharedObject = await dataObject.getSharedObject<ISharedDirectory>(mapId);
			return { container, sharedObject };
		}

		const a = await connect();
		const b = await connect();

		assert(a.sharedObject.isAttached());
		assert(b.sharedObject.isAttached());

		a.sharedObject.set("K", "V");
		await objProvider.ensureSynchronized();
		assert.equal(a.sharedObject.get("K"), "V");
		assert.equal(b.sharedObject.get("K"), "V");
	});

	it("collab2", async () => {
		const driver = new LocalServerTestDriver();
		const mapId = "TestMap";

		let registry: ChannelFactoryRegistry;

		const containerRuntimeFactory = (): fluidEntryPoint =>
			new TestContainerRuntimeFactory(
				"@fluid-example/test-dataStore",
				new TestFluidObjectFactory(registry),
				{
					enableRuntimeIdCompressor: "on",
				},
			);

		const objProvider = new TestObjectProvider(Loader, driver, containerRuntimeFactory);

		let first = true;

		async function connect<T>(kind: ISharedObjectKind<T>): Promise<{
			container: IContainer;
			sharedObject: T;
		}> {
			registry = [[mapId, kind.getFactory()]];

			const container = first
				? await objProvider.makeTestContainer()
				: await objProvider.loadTestContainer();
			const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			const sharedObject = await dataObject.getSharedObject<T>(mapId);

			// eslint-disable-next-line require-atomic-updates
			first = false;
			return { container, sharedObject };
		}

		// A

		const a = await connect(SharedMap);
		a.sharedObject.set("K", "V");
		assert.equal(a.sharedObject.get("K"), "V");
		assert(a.sharedObject.isAttached());
		await objProvider.ensureSynchronized();

		// B

		const b = await connect(MapToTree);
		await objProvider.ensureSynchronized();

		assert.equal(b.sharedObject.get("K"), "V");

		a.container.close();

		assert.equal(b.sharedObject[shimInfo].status, MigrationStatus.Before);
		b.sharedObject[shimInfo].upgrade();
		assert.equal(b.sharedObject[shimInfo].status, MigrationStatus.After);
		assert.equal(b.sharedObject.get("K"), "V");
		await objProvider.ensureSynchronized();

		// C

		const c = await connect(TreeFromMap);
		const config = new TreeViewConfiguration({
			schema: MapAdapterRoot,
			enableSchemaValidation: true,
			preventAmbiguity: true,
		});
		const view = c.sharedObject.viewWith(config);
		assert.equal(view.root.get("K")?.json, "V");
	});
});
