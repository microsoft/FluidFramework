/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { IDirectory, SharedDirectory } from "@fluidframework/map";
import { LocalDataObject, toLocalChannel, Directory } from "@fluid-experimental/to-non-fluid";
import { AttachState } from "@fluidframework/container-definitions";
import { ChildDataObject, childType } from "./childDataObject";

const counterKey = "counter";
const directoryKey = "directory";
const childKey = "child";
export const rootType = "root";
export class RootDataObject extends DataObject {
	public static readonly factory = new DataObjectFactory(
		rootType,
		RootDataObject,
		[SharedCounter.getFactory(), SharedDirectory.getFactory()],
		{},
	);

	private _counter?: SharedCounter;
	public get counter() {
		assert(this._counter !== undefined, "Shared counter should be defined before retrieval");
		return this._counter;
	}

	private _directory?: SharedDirectory;
	public get directory() {
		assert(this._directory !== undefined, "directory should be defined before retrieval");
		return this._directory;
	}

	private _child?: ChildDataObject;
	public get child() {
		assert(this._child !== undefined, "directory should be defined before retrieval");
		return this._child;
	}

	public async getFluidObject<T>(key: string): Promise<T> {
		const handle = this.root.get<IFluidHandle<T>>(key);
		assert(handle !== undefined, "handle should exist");
		const object = await handle.get();
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

	public async hasInitialized(): Promise<void> {
		this._counter = await this.getFluidObject<SharedCounter>(counterKey);
		this._directory = await this.getFluidObject<SharedDirectory>(directoryKey);
		this._child = await this.getFluidObject<ChildDataObject>(childKey);
	}

	public async toLocalDataObject(): Promise<LocalDataObject> {
		const type = this.context.packagePath[this.context.packagePath.length - 1];
		const localDataObject = new LocalDataObject(type);

		// de-fluid DDS
		localDataObject.dataStructures.set(counterKey, toLocalChannel(this.counter));
		localDataObject.dataStructures.set(directoryKey, toLocalChannel(this.directory));

		// de-fluid data objects - this may not be a good idea for all customers who do not have a guaranteed tree like graph structure
		localDataObject.dataObjects.set(childKey, await this.child.toLocalDataObject());

		return localDataObject;
	}

	public async fromLocalDataObject(localDataObject: LocalDataObject) {
		assert(this.runtime.attachState === AttachState.Detached, "Can only transition detached!");
		assert(this.context.deltaManager.lastKnownSeqNumber === 0, "Should be empty container!");
		const type = this.context.packagePath[this.context.packagePath.length - 1];
		assert(localDataObject.type === type, "Type should match!");

		const localCounter = localDataObject.getDataStructure<number>(counterKey);
		assert(localCounter.type === SharedCounter.getFactory().type, "counter type mismatch");
		this.counter.increment(localCounter.value);

		const directory = localDataObject.getDataStructure<Directory>(directoryKey);
		assert(directory.type === SharedDirectory.getFactory().type, "type mismatch");
		populateSharedDirectory(this.directory, directory.value);

		const childLocalDataObject = localDataObject.getLocalDataObject(childKey);
		await this.child.fromLocalDataObject(childLocalDataObject);
	}
}

function populateSharedDirectory(sharedDirectory: IDirectory, directory: Directory) {
	for (const [key, value] of directory.entries()) {
		sharedDirectory.set(key, value);
	}
	for (const [key, subDirectory] of directory.subdirectories()) {
		const sharedSubDirectory = sharedDirectory.createSubDirectory(key);
		populateSharedDirectory(sharedSubDirectory, subDirectory);
	}
}
