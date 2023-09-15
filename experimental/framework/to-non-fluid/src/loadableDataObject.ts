/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";
import { SharedCounter } from "@fluidframework/counter";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { AttachState } from "@fluidframework/container-definitions";
import { LocalDataObject } from "./localDataStore";
import { toLocalChannel } from "./toLocalFluid";
import { fromLocalDataStructure } from "./fromLocalFluid";

export type SupportedSharedObjects = SharedCounter | SharedDirectory | SharedMap | SharedString;

export class LoadableDataObject extends DataObject {
	public get attributes() {
		return undefined;
	}
	public static Type = "loadable";
	public static readonly factory = new DataObjectFactory(
		LoadableDataObject.Type,
		LoadableDataObject,
		[
			SharedCounter.getFactory(),
			SharedDirectory.getFactory(),
			SharedMap.getFactory(),
			SharedString.getFactory(),
		],
		{},
	);
	public static getFactory(type: string) {
		return new DataObjectFactory(
			type,
			LoadableDataObject,
			[
				SharedCounter.getFactory(),
				SharedDirectory.getFactory(),
				SharedMap.getFactory(),
				SharedString.getFactory(),
			],
			{},
		);
	}

	public readonly childDataObjects: LoadableDataObject[] = [];

	public readonly childSharedObjects: SupportedSharedObjects[] = [];

	public async hasInitialized(): Promise<void> {
		for (const [_, handle] of this.root) {
			const child = await (
				handle as IFluidHandle<SupportedSharedObjects | LoadableDataObject>
			).get();
			if (child.attributes !== undefined) {
				this.childSharedObjects.push(child);
			} else {
				this.childDataObjects.push(child);
			}
		}
	}

	public async createChildDataObject(
		key: string,
		type: string = LoadableDataObject.Type,
	): Promise<LoadableDataObject> {
		assert(!this.root.has(key), "key should not exist on creation!");
		const child = await this.context.containerRuntime.createDataStore(type);
		assert(child.entryPoint !== undefined, "should have entrypoint!");
		const dataObject = (await child.entryPoint.get()) as LoadableDataObject;
		this.root.set(key, dataObject.handle);
		this.childDataObjects.push(dataObject);
		return dataObject;
	}

	// Handles considered as references will need to be discussed as a limitation

	public async toLocalDataObject(): Promise<LocalDataObject> {
		const type = this.context.packagePath[this.context.packagePath.length - 1];
		const localDataObject = new LocalDataObject(type);

		// de-fluid DDS
		for (const [key, handle] of this.root) {
			const child = await (
				handle as IFluidHandle<SupportedSharedObjects | LoadableDataObject>
			).get();
			if (child.attributes !== undefined) {
				localDataObject.dataStructures.set(key, toLocalChannel(child));
			} else {
				localDataObject.dataObjects.set(key, await child.toLocalDataObject());
			}
		}

		return localDataObject;
	}

	public async fromLocalDataObject(localDataObject: LocalDataObject) {
		assert(this.runtime.attachState === AttachState.Detached, "Can only transition detached!");
		assert(this.context.deltaManager.lastKnownSeqNumber === 0, "Should be empty container!");
		const type = this.context.packagePath[this.context.packagePath.length - 1];
		assert(
			localDataObject.type === type,
			`Type should match ${localDataObject.type} = ${type}!`,
		);

		for (const [key, localDataStructure] of localDataObject.dataStructures) {
			const child = fromLocalDataStructure(localDataStructure, this.runtime);
			this.root.set(key, child.handle);
			this.childSharedObjects.push(child);
		}

		for (const [key, childDataObject] of localDataObject.dataObjects) {
			const child = await this.createChildDataObject(key, childDataObject.type);
			await child.fromLocalDataObject(childDataObject);
		}
	}
}
