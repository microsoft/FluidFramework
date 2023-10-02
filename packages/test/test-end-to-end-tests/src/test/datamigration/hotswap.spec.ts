/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { SharedMap } from "@fluidframework/map";
import {
	ITestObjectProvider,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils";
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
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { LoaderHeader } from "@fluidframework/container-definitions";

class TestDataObject extends DataObject {
	private channel?: IChannel;
	public async initializingFirstTime(props?: any): Promise<void> {
		const cell = this.runtime.createChannel("cell", SharedCell.getFactory().type);
		this.root.set("cell", cell.handle);
		this.channel = cell;
	}

	public createSpanner<TOld extends SharedCell, TNew extends SharedMap>(): Spanner<TOld, TNew> {
		const spanner = this.runtime.createChannel(
			"spanner",
			SharedCell.getFactory().type,
		) as Spanner<TOld, TNew>;
		this.root.set("spanner", spanner.handle);
		return spanner;
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
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
	};

	const oldChannelFactory = SharedCell.getFactory();
	const oldDataObjectFactory = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[oldChannelFactory],
		{},
	);

	// The 1st runtime factory, V1 of the code
	const runtimeFactory1 = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: oldDataObjectFactory,
		registryEntries: [oldDataObjectFactory.registryEntry],
	});

	const spannerSharedCellFactory = new SpannerFactory<SharedCell, SharedMap>(
		SharedCell.getFactory(),
		SharedMap.getFactory(),
	);

	const spannerSharedMapFactory = new SpannerFactory<SharedMap, SharedMap>(
		SharedMap.getFactory(),
		SharedMap.getFactory(),
	);

	const spannerDataObjectFactory = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[spannerSharedCellFactory, spannerSharedMapFactory],
		{},
	);

	// The 2nd runtime factory, V2 of the code
	const runtimeFactory2 = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: spannerDataObjectFactory,
		registryEntries: [spannerDataObjectFactory.registryEntry],
		runtimeOptions,
	});

	// The 3rd runtime factory, a runtime factory proving that the SpannerFactory is not needed once hot swap has occurred
	const runtimeFactory3 = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[SharedMap.getFactory()],
		{},
	);
	const noSpannerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: runtimeFactory3,
		registryEntries: [runtimeFactory3.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;

	const originalValue = "456";
	const migrateKey = "key";
	const newKey = "other";
	const newValue = "value";

	beforeEach(async () => {
		provider = getTestObjectProvider();
		const container = await provider.createContainer(runtimeFactory1);
		const testObj = await requestFluidObject<TestDataObject>(container, "/");
		const cell = testObj.getSharedObject<SharedCell>();
		cell.set(originalValue);
		// make sure changes are saved.
		await provider.ensureSynchronized();
		container.close();
	});

	it("Can Hot Swap", async () => {
		const container1 = await provider.loadContainer(runtimeFactory2);
		const testObj1 = await requestFluidObject<TestDataObject>(container1, "/");
		const spanner1 = testObj1.getSharedObject<Spanner<SharedCell, SharedMap>>();

		const container2 = await provider.loadContainer(runtimeFactory2);
		const testObj2 = await requestFluidObject<TestDataObject>(container2, "/");
		const spanner2 = testObj2.getSharedObject<Spanner<SharedCell, SharedMap>>();

		await provider.ensureSynchronized();

		// Hot swap
		const { new: map1, old: cell1 } = spanner1.swap();
		map1.set(migrateKey, cell1.get());
		spanner1.reconnect();

		const { new: map2, old: cell2 } = spanner2.swap();
		map2.set(migrateKey, cell2.get());
		spanner2.reconnect();

		// Send ops
		map1.set(newKey, newValue);
		await provider.ensureSynchronized();
		const migratedValueMap1 = map1.get(migrateKey);
		const migratedValueMap2 = map2.get(migrateKey);
		assert(
			migratedValueMap2 === originalValue && migratedValueMap2 === migratedValueMap1,
			`Failed to migrate values original ${originalValue} migrated 1: ${migratedValueMap1}, 2: ${migratedValueMap2}`,
		);
		assert(
			map2.get(newKey) === newValue && map2.get(newKey) === map1.get(newKey),
			"Failed to hot swap",
		);
	});

	it("Can Summarize Hot Swap - SharedMap snapshot can be loaded from a SharedMapFactory", async () => {
		const { summarizer, container: container1 } = await createSummarizerFromFactory(
			provider,
			await provider.loadContainer(runtimeFactory2),
			spannerDataObjectFactory,
		);

		const testObj1 = await requestFluidObject<TestDataObject>(container1, "/");
		const spanner1 = testObj1.getSharedObject<Spanner<SharedCell, SharedMap>>();

		await provider.ensureSynchronized();

		// Hot swap
		const { new: map1, old: cell1 } = spanner1.swap();
		map1.set(migrateKey, cell1.get());
		spanner1.reconnect();

		// Summarize
		await provider.ensureSynchronized();
		const { summaryVersion } = await summarizeNow(summarizer, "test");

		// Load from summary with a SharedMapFactory instead of a SpannerFactory
		const container2 = await provider.loadContainer(noSpannerRuntimeFactory, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});

		const testObj2 = await requestFluidObject<TestDataObject>(container2, "/");
		const map2 = testObj2.getSharedObject<SharedMap>();
		assert(map2.get(migrateKey) === originalValue, "Failed to summarize hot swap");
	});

	it("Can Summarize Hot Swap, SharedMap snapshot can be loaded from a SpannerFactory", async () => {
		const { summarizer, container: container1 } = await createSummarizerFromFactory(
			provider,
			await provider.loadContainer(runtimeFactory2),
			spannerDataObjectFactory,
		);

		const testObj1 = await requestFluidObject<TestDataObject>(container1, "/");
		const spanner1 = testObj1.getSharedObject<Spanner<SharedCell, SharedMap>>();

		await provider.ensureSynchronized();

		// Hot swap
		const { new: map1, old: cell1 } = spanner1.swap();
		map1.set(migrateKey, cell1.get());
		spanner1.reconnect();

		// Summarize
		await provider.ensureSynchronized();
		const { summaryVersion } = await summarizeNow(summarizer, "test");

		// Load from summary with a spanner factory
		const container2 = await provider.loadContainer(runtimeFactory2, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});

		const testObj2 = await requestFluidObject<TestDataObject>(container2, "/");
		const spanner2 = testObj2.getSharedObject<Spanner<SharedMap, SharedMap>>();
		const map2 = spanner2.target;
		assert(map2.get(migrateKey) === originalValue, "Failed to summarize hot swap");
	});

	it("Can create a channel and hot swap it within the same container", async () => {
		const container = await provider.loadContainer(runtimeFactory2);
		const testObj = await requestFluidObject<TestDataObject>(container, "/");
		const spanner = testObj.createSpanner();
		(spanner.target as SharedCell).set(originalValue);

		await provider.ensureSynchronized();

		// Hot swap
		const { new: map, old: cell } = spanner.swap();
		map.set(migrateKey, cell.get());
		spanner.reconnect();

		// Send ops
		await provider.ensureSynchronized();
		const migratedValueMap1 = map.get(migrateKey);
		assert(
			migratedValueMap1 === originalValue,
			`Failed to migrate values original: ${originalValue}, migrated: ${migratedValueMap1}`,
		);
	});

	it("Hot swap can happen on migrate op", async () => {
		const container = await provider.loadContainer(runtimeFactory2);
		const testObj = await requestFluidObject<TestDataObject>(container, "/");
		const spanner = testObj.createSpanner();
		(spanner.target as SharedCell).set(originalValue);

		await provider.ensureSynchronized();
		spanner.migrate = (cell, map) => {
			map.set(migrateKey, cell.get());
		};

		// Hot swap
		spanner.submitMigrateOp();

		// Send ops
		await provider.ensureSynchronized();
		assert(
			spanner.target.attributes.type === SharedMap.getFactory().type,
			"should have migrated to a shared map",
		);
		const migratedValueMap1 = (spanner.target as SharedMap).get(migrateKey);
		assert(
			migratedValueMap1 === originalValue,
			`Failed to migrate values original: ${originalValue}, migrated: ${migratedValueMap1}`,
		);
	});
});
