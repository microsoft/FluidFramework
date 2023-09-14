/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { LocalDataObject, toLocalChannel } from "@fluid-experimental/to-non-fluid";
import { SharedString } from "@fluidframework/sequence";
import { SharedMap } from "@fluidframework/map";
import { AttachState } from "@fluidframework/container-definitions";

const stringKey = "string";
const mapKey = "map";
export const childType = "child";
export class ChildDataObject extends DataObject {
	public static readonly factory = new DataObjectFactory(
		childType,
		ChildDataObject,
		[SharedString.getFactory(), SharedMap.getFactory()],
		{},
	);

	private _sharedString?: SharedString;
	public get sharedString() {
		assert(this._sharedString !== undefined, "string should be defined before retrieval");
		return this._sharedString;
	}

	private _map?: SharedMap;
	public get map() {
		assert(this._map !== undefined, "map should be defined before retrieval");
		return this._map;
	}

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

	public async hasInitialized(): Promise<void> {
		this._sharedString = await this.getFluidObject<SharedString>(stringKey);
		this._map = await this.getFluidObject<SharedMap>(mapKey);
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

		return localDataObject;
	}

	public async fromLocalDataObject(localDataObject: LocalDataObject) {
		assert(this.runtime.attachState === AttachState.Detached, "Can only transition detached!");
		assert(this.context.deltaManager.lastKnownSeqNumber === 0, "Should be empty container!");
		const type = this.context.packagePath[this.context.packagePath.length - 1];
		assert(localDataObject.type === type, "Type should match!");
		const localString = localDataObject.getDataStructure<string>(stringKey);
		assert(localString.type === SharedString.getFactory().type, "string type mismatch");
		this.sharedString.insertText(0, localString.value);
		const localMap = localDataObject.getDataStructure<Map<string, any>>(mapKey);
		assert(localMap.type === SharedMap.getFactory().type, "directory type mismatch");
		populateSharedMap(this.map, localMap.value);
	}
}

function populateSharedMap(sharedMap: SharedMap, map: Map<string, any>) {
	for (const [key, value] of map.entries()) {
		sharedMap.set(key, value);
	}
}
