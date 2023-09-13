/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { LocalDataObject, toLocalChannel } from "@fluid-experimental/to-non-fluid";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedCounter } from "@fluidframework/counter";
import { SharedString } from "@fluidframework/sequence";
import { IFluidHandle } from "@fluidframework/core-interfaces";

const counterKey = "counter";
const directoryKey = "directory";
const childKey = "child";
const rootType = "root";
class RootDataObject extends DataObject {
	public async getFluidObject<T>(key: string): Promise<T> {
		const handle = this.root.get<IFluidHandle<T>>(key);
		assert(handle !== undefined, "handle should exist");
		const object = await handle?.get();
		return object;
	}

	public async initializingFirstTime(): Promise<void> {
		const counter = SharedCounter.create(this.runtime);
		this.root.set(counterKey, counter.handle);
		const directory = SharedDirectory.create(this.runtime);
		this.root.set(directoryKey, directory.handle);
		const child = await this.context.containerRuntime.createDataStore(childType);
		assert(child.entryPoint !== undefined, "should have handle");
		this.root.set(childKey, child.entryPoint);
	}

	public async toLocalDataObject(): Promise<LocalDataObject> {
		const type = this.context.packagePath[this.context.packagePath.length - 1];
		const localDataObject = new LocalDataObject(type);

		// de-fluid DDS
		const counter = await this.getFluidObject<SharedCounter>(counterKey);
		localDataObject.dataStructures.set(counterKey, toLocalChannel(counter));
		const directory = await this.getFluidObject<SharedDirectory>(directoryKey);
		localDataObject.dataStructures.set(directoryKey, toLocalChannel(directory));

		// de-fluid data objects - this may not be a good idea for all customers who do not have a guaranteed tree like graph structure
		const child = await this.getFluidObject<ChildDataObject>(childKey);
		localDataObject.dataObjects.set(childKey, await child.toLocalDataObject());

		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return localDataObject;
	}
}

const stringKey = "string";
const mapKey = "map";
const childType = "child";
class ChildDataObject extends DataObject {
	public async getFluidObject<T>(key: string): Promise<T> {
		const handle = this.root.get<IFluidHandle<T>>(key);
		assert(handle !== undefined, "handle should exist");
		const object = await handle?.get();
		return object;
	}

	public async initializingFirstTime(): Promise<void> {
		const sharedString = SharedString.create(this.runtime);
		this.root.set(stringKey, sharedString.handle);
		const sharedMap = SharedMap.create(this.runtime);
		this.root.set(mapKey, sharedMap.handle);
	}

	// The customer is responsible for handling all their handles
	public async toLocalDataObject(): Promise<LocalDataObject> {
		const type = this.context.packagePath[this.context.packagePath.length - 1];
		const localDataObject = new LocalDataObject(type);

		// de-fluid DDS
		const sharedString = await this.getFluidObject<SharedString>(stringKey);
		localDataObject.dataStructures.set(stringKey, toLocalChannel(sharedString));
		const map = await this.getFluidObject<SharedMap>(mapKey);
		localDataObject.dataStructures.set(mapKey, toLocalChannel(map));

		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return localDataObject;
	}
}

describeNoCompat("Local fluid", (getTestObjectProvider) => {
	const rootDataObjectFactory = new DataObjectFactory(
		rootType,
		RootDataObject,
		[SharedCounter.getFactory()],
		undefined,
	);

	const childDataObjectFactory = new DataObjectFactory(
		childType,
		ChildDataObject,
		[SharedString.getFactory(), SharedMap.getFactory()],
		undefined,
	);

	const containerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
		rootDataObjectFactory,
		[
			[rootType, Promise.resolve(rootDataObjectFactory)],
			[childType, Promise.resolve(childDataObjectFactory)],
		],
	);

	let provider: ITestObjectProvider;
	const createContainer = async (): Promise<IContainer> => {
		return provider.createContainer(containerRuntimeFactory);
	};

	beforeEach(async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	it("Can convert from a container runtime to local runtime", async () => {
		const container = await createContainer();
		const dataObject = await requestFluidObject<RootDataObject>(container, "/");
		await provider.ensureSynchronized();
		const localGraph = await dataObject.toLocalDataObject();
		console.log(localGraph);
		console.log("trap");
	});
});
