/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IEvent, IEventProvider, IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";
import { SharedCounter } from "@fluidframework/counter";
import { IValueChanged, SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { AttachState } from "@fluidframework/container-definitions";
import { LocalDataObject } from "./localDataStore";
import { toLocalChannel } from "./toLocalFluid";
import { fromLocalDataStructure } from "./fromLocalFluid";

export type SupportedSharedObjects = SharedCounter | SharedDirectory | SharedMap | SharedString;

export interface ILoadableEvent extends IEvent {
	(event: "sharedObjectsUpdated", listener: (message: any) => void);
	(event: "dataObjectsUpdated", listener: (message: any) => void);
}

export class LoadableDataObject extends DataObject implements IEventProvider<ILoadableEvent> {
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
		for (const handle of this.root.values()) {
			const child = await (
				handle as IFluidHandle<SupportedSharedObjects | LoadableDataObject>
			).get();
			if (child.attributes !== undefined) {
				this.childSharedObjects.push(child);
			} else {
				this.childDataObjects.push(child);
			}
		}
		this.root.on("containedValueChanged", (value: IValueChanged) => {
			const handle = this.root.get(value.key) as IFluidHandle<
				SupportedSharedObjects | LoadableDataObject
			>;
			handle.get().then((fluidObject) => {
				if (fluidObject.attributes !== undefined) {
					this.childSharedObjects.push(fluidObject);
					this.emit("sharedObjectsUpdated");
				} else {
					this.childDataObjects.push(fluidObject);
					this.emit("dataObjectsUpdated");
				}
			});
		});
	}

	private storeFluidObject(
		key: string,
		fluidObject: SupportedSharedObjects | LoadableDataObject,
	) {
		assert(!this.hasFluidObject(key), "should not be overriding a fluid object");
		this.root.set(key, fluidObject.handle);
	}

	public hasFluidObject(key: string): boolean {
		return this.root.has(key);
	}

	public async createChildDataObject(
		key: string,
		type: string = LoadableDataObject.Type,
	): Promise<LoadableDataObject> {
		assert(!this.hasFluidObject(key), "key should not exist on creation!");
		const child = await this.context.containerRuntime.createDataStore(type);
		assert(child.entryPoint !== undefined, "should have entrypoint!");
		const dataObject = (await child.entryPoint.get()) as LoadableDataObject;
		this.storeFluidObject(key, dataObject);
		return dataObject;
	}

	public createChildSharedObject(type: string) {
		let channel: SupportedSharedObjects;
		switch (type) {
			case SharedCounter.getFactory().type: {
				channel = SharedCounter.create(this.runtime);
				break;
			}
			case SharedDirectory.getFactory().type: {
				channel = SharedDirectory.create(this.runtime);
				break;
			}
			case SharedMap.getFactory().type: {
				channel = SharedMap.create(this.runtime);
				break;
			}
			case SharedString.getFactory().type: {
				channel = SharedString.create(this.runtime);
				break;
			}
			default: {
				throw new Error("unsupported shared object");
			}
		}
		this.storeFluidObject(channel.id, channel);
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
			this.storeFluidObject(key, child);
		}

		for (const [key, childDataObject] of localDataObject.dataObjects) {
			const child = await this.createChildDataObject(key, childDataObject.type);
			await child.fromLocalDataObject(childDataObject);
		}
	}
}
