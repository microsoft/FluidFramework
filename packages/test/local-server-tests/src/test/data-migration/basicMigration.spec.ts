/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { SharedTree as LegacySharedTree } from "@fluid-experimental/tree";
import { LocalServerTestDriver } from "@fluid-private/test-drivers";
import { DataObjectFactory } from "@fluidframework/aqueduct/internal";
import { LoaderHeader, type IContainer } from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import type { ISharedDirectory } from "@fluidframework/map/internal";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	TestObjectProvider,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";
import type { ITree } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/internal";

import {
	DOWithST,
	DOWithST2,
	newRuntimeFactory,
	treeConfig1,
	treeConfig2,
	type RootDO2,
} from "./newCode.js";
import { oldRuntimeFactory, RootDO, setLSTQuantity } from "./oldCode.js";
import { runtimeOptions } from "./utils.js";

const lstValue1 = 42;
const lstValue2 = 38;
const dirValue = "bar";

function modifyOldFile(rootDataObject: RootDO) {
	setLSTQuantity(rootDataObject.doWithLST.tree, lstValue1);
	setLSTQuantity(rootDataObject.doWithLSTAndDir.tree, lstValue2);
	rootDataObject.doWithLSTAndDir.subDirectory.set("value", dirValue);
}

interface IDataObject {
	_root: ISharedDirectory;
}

async function getObjectByHandle<T>(dataObject: IDataObject, key: string): Promise<T> {
	const handle = dataObject._root.get<IFluidHandle<T>>(key);
	assert(handle !== undefined, `Expected handle to be defined for key: ${key}`);
	return handle.get();
}

async function validateNewRoot(
	rootDataObject: RootDO2,
	provider: ITestObjectProvider,
	runtimeFactory: ContainerRuntimeFactoryWithDefaultDataStore,
	readContainer?: IContainer,
) {
	// Validate in memory objects
	const view = rootDataObject.doWithST.view;
	const view2 = rootDataObject.doWithST2.view;

	assert.equal(view.root.quantity, lstValue1, "Expected view.quantity to match");
	assert.equal(view2.root.quantity, lstValue2, "Expected view2.quantity to match");
	assert.equal(view2.root.dir.value, dirValue, "Expected view2.dir.value to match");

	// Validate handles
	const dObject = await getObjectByHandle<DOWithST>(rootDataObject, "a");
	const dObject2 = await getObjectByHandle<DOWithST2>(rootDataObject, "b");
	const tree = await getObjectByHandle<ITree>(rootDataObject, "tree");
	const tree1 = await getObjectByHandle<ITree>(dObject, "tree");
	const tree2 = await getObjectByHandle<ITree>(dObject2, "tree");

	const treeView = tree.viewWith(treeConfig1);
	const treeView1 = tree1.viewWith(treeConfig1);
	const treeView2 = tree2.viewWith(treeConfig2);

	assert.equal(treeView.root.quantity, lstValue1, "Expected treeView.quantity to match");
	assert.equal(treeView1.root.quantity, lstValue1, "Expected treeView1.quantity to match");
	assert.equal(treeView2.root.quantity, lstValue2, "Expected treeView2.quantity to match");
	assert.equal(treeView2.root.dir.value, dirValue, "Expected treeView2.dir.value to match");

	// Can send and receive ops
	const container = readContainer ?? (await provider.loadContainer(runtimeFactory));
	const rootDataObjectB = (await container.getEntryPoint()) as RootDO2;
	const viewB = rootDataObjectB.doWithST.view;
	const view2B = rootDataObjectB.doWithST2.view;
	await provider.ensureSynchronized();

	treeView.root.quantity = 5;
	treeView2.root.quantity = 6;
	treeView2.root.dir.value = "baz";
	await provider.ensureSynchronized();

	assert.equal(
		treeView.root.quantity,
		viewB.root.quantity,
		"Expected treeView.quantity to match",
	);
	assert.equal(treeView.root.quantity, 5, "Expected treeView.quantity to update");
	assert.equal(
		treeView2.root.quantity,
		view2B.root.quantity,
		"Expected treeView1.quantity to match",
	);
	assert.equal(treeView2.root.quantity, 6, "Expected treeView2.quantity to update");
	assert.equal(
		treeView2.root.dir.value,
		view2B.root.dir.value,
		"Expected treeView2.dir.value to match",
	);
	assert.equal(treeView2.root.dir.value, "baz", "Expected treeView2.dir.value to update");
}

export interface IMigrationStrategy {
	name: string;
	runtimeFactory: ContainerRuntimeFactoryWithDefaultDataStore;
	migrateWithSummary(provider: ITestObjectProvider): Promise<string>;
	migrateWithoutSummary(provider: ITestObjectProvider): Promise<RootDO2>;
	migrateWithManyContainers(...containers: IContainer[]): Promise<RootDO2[]>;
}

const DOWithSTFactory = new DataObjectFactory(
	"a",
	DOWithST,
	[SharedTree.getFactory(), LegacySharedTree.getFactory()],
	{},
);
const DOWithST2Factory = new DataObjectFactory(
	"b",
	DOWithST2,
	[SharedTree.getFactory(), LegacySharedTree.getFactory()],
	{},
);
const rootDOFactory = new DataObjectFactory(
	"rootdo",
	RootDO,
	[LegacySharedTree.getFactory()],
	{},
	[DOWithSTFactory.registryEntry, DOWithST2Factory.registryEntry],
);
const exampleRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
	defaultFactory: rootDOFactory,
	registryEntries: [rootDOFactory.registryEntry],
	runtimeOptions,
});

class ExampleStrategy implements IMigrationStrategy {
	name: string = "Example strategy";
	runtimeFactory = exampleRuntimeFactory;
	public async migrateWithSummary(provider: ITestObjectProvider): Promise<string> {
		return "abc";
	}
	public async migrateWithoutSummary(provider: ITestObjectProvider): Promise<RootDO2> {
		const container = await provider.loadContainer(this.runtimeFactory);
		const rootDataObject = (await container.getEntryPoint()) as RootDO2;
		return rootDataObject;
	}
	public async migrateWithManyContainers(...containers: IContainer[]): Promise<RootDO2[]> {
		throw new Error();
	}
}

const migrationStrategies: IMigrationStrategy[] = [new ExampleStrategy()];
const createFluidEntryPoint = () => {
	throw new Error();
};
describe.skip("basicMigration", () => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		const driver = new LocalServerTestDriver();
		provider = new TestObjectProvider(Loader, driver, createFluidEntryPoint);
	});

	for (const strategy of migrationStrategies) {
		describe(strategy.name, () => {
			it("can migrate in op stream", async () => {
				const container = await provider.createContainer(oldRuntimeFactory);
				const rootDataObject = (await container.getEntryPoint()) as RootDO;
				modifyOldFile(rootDataObject);
				await provider.ensureSynchronized();
				container.close();

				const rootDO2 = await strategy.migrateWithoutSummary(provider);
				await validateNewRoot(rootDO2, provider, strategy.runtimeFactory);
			});

			it("can migrate and generate summary", async () => {
				const container = await provider.createContainer(oldRuntimeFactory);
				const rootDataObject = (await container.getEntryPoint()) as RootDO;
				modifyOldFile(rootDataObject);
				await provider.ensureSynchronized();
				container.close();

				const summaryVersion = await strategy.migrateWithSummary(provider);

				const container2 = await provider.loadContainer(newRuntimeFactory, undefined, {
					[LoaderHeader.version]: summaryVersion,
				});
				const rootDataObject2 = (await container2.getEntryPoint()) as RootDO2;
				await validateNewRoot(rootDataObject2, provider, strategy.runtimeFactory);
			});

			it("can create new container", async () => {
				const container = await provider.createContainer(strategy.runtimeFactory);
				const rootDataObject = (await container.getEntryPoint()) as RootDO2;
				rootDataObject.doWithST.view.root.quantity = lstValue1;
				rootDataObject.doWithST2.view.root.quantity = lstValue2;
				rootDataObject.doWithST2.view.root.dir.value = dirValue;
				await provider.ensureSynchronized();
				await validateNewRoot(rootDataObject, provider, newRuntimeFactory);
			});

			it("has a strategy for migrating multiple containers", async () => {
				const container = await provider.createContainer(oldRuntimeFactory);
				const rootDataObject = (await container.getEntryPoint()) as RootDO;
				modifyOldFile(rootDataObject);
				await provider.ensureSynchronized();
				container.close();

				const c1 = await provider.loadContainer(strategy.runtimeFactory);
				const c2 = await provider.loadContainer(strategy.runtimeFactory);
				const c3 = await provider.loadContainer(strategy.runtimeFactory);
				await provider.ensureSynchronized();

				const rootDO2s = await strategy.migrateWithManyContainers(c1, c2, c3);
				await provider.ensureSynchronized();

				const c4 = await provider.loadContainer(strategy.runtimeFactory);

				for (const rootDO2 of rootDO2s) {
					await validateNewRoot(rootDO2, provider, strategy.runtimeFactory, c4);
				}
			});
		});
	}
});
