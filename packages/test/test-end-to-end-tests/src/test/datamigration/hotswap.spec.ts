/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { SharedMap } from "@fluidframework/map";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { Spanner, SpannerFactory } from "@fluid-experimental/spanner";
import { SharedCell } from "@fluidframework/cell";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IChannel } from "@fluidframework/datastore-definitions";

class TestDataObject extends DataObject {
	private channel?: IChannel;
	public async initializingFirstTime(props?: any): Promise<void> {
		const cell = this.runtime.createChannel("cell", SharedCell.getFactory().type);
		this.root.set("cell", cell.handle);
		this.channel = cell;
	}

	public async hasInitialized(): Promise<void> {
		const cell = await this.runtime.getChannel("cell");
		this.channel = cell;
	}

	public getSharedObject<T>() {
		return this.channel as T;
	}
}

describeNoCompat("HotSwap", (getTestObjectProvider) => {
	const oldChannelFactory = SharedCell.getFactory();
	const oldDataObjectFactory = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[oldChannelFactory],
		{},
	);
	const oldRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: oldDataObjectFactory,
		registryEntries: [oldDataObjectFactory.registryEntry],
	});

	const newChannelFactory = new SpannerFactory<SharedCell, SharedMap>(
		SharedCell.getFactory(),
		SharedMap.getFactory(),
	);
	const newDataObjectFactory = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[newChannelFactory],
		{},
	);
	const newRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: newDataObjectFactory,
		registryEntries: [newDataObjectFactory.registryEntry],
	});
	let provider: ITestObjectProvider;

	beforeEach(async () => {
		provider = getTestObjectProvider();
	});

	const originalValue = "123";
	const migrateKey = "key";
	const newKey = "other";
	const newValue = "value";

	it("Should Hot Swap", async function () {
		const container1 = await provider.createContainer(oldRuntimeFactory);
		const testObj1 = await requestFluidObject<TestDataObject>(container1, "/");
		const cell1 = testObj1.getSharedObject<SharedCell>();
		cell1.set(originalValue);
		container1.close();

		const container2 = await provider.loadContainer(newRuntimeFactory);
		const testObj2 = await requestFluidObject<TestDataObject>(container2, "/");
		const swappable2 = testObj2.getSharedObject<Spanner<SharedCell, SharedMap>>();

		const container3 = await provider.loadContainer(newRuntimeFactory);
		const testObj3 = await requestFluidObject<TestDataObject>(container3, "/");
		const swappable3 = testObj3.getSharedObject<Spanner<SharedCell, SharedMap>>();

		await provider.ensureSynchronized();
		(swappable2.target as SharedCell).set("456");
		await provider.ensureSynchronized();

		// Hot swap
		const { new: map2, old: cell2 } = swappable2.swap();
		map2.set(migrateKey, cell2.get());
		swappable2.reconnect();

		const { new: map3, old: cell3 } = swappable3.swap();
		map3.set(migrateKey, cell3.get());
		swappable3.reconnect();

		// Send ops
		map2.set(newKey, newValue);
		await provider.ensureSynchronized();
		assert(
			map3.get(migrateKey) === originalValue && map3.get(migrateKey) === map2.get(migrateKey),
			"Failed to migrate values",
		);
		assert(
			map3.get(newKey) === newValue && map3.get(newKey) === map2.get(newKey),
			"Failed to hot swap",
		);
	});
});
