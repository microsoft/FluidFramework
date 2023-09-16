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
import { findDataObject, fromLocalDataStructure } from "./fromLocalFluid";
import { LocalHandle } from "./localHandle";

export type SupportedSharedObjects = SharedCounter | SharedDirectory | SharedMap | SharedString;

export interface ILoadableEvent extends IEvent {
	(event: "sharedObjectsUpdated", listener: (message: any) => void);
	(event: "dataObjectsUpdated", listener: (message: any) => void);
	(event: "handlesUpdated", listener: (message: any) => void);
}

export class ReferenceHandle {
	public readonly isReferenceHandle = true;
	constructor(public readonly handle: IFluidHandle<LoadableDataObject>) {}
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

	private _path?: string[];
	public get path(): string[] {
		assert(this._path !== undefined, "path should be defined");
		return [...this._path];
	}
	private localDataObject?: LocalDataObject;

	private readonly dataObjectMap: Map<string, LoadableDataObject> = new Map();
	private readonly sharedObjectMap: Map<string, SupportedSharedObjects> = new Map();
	private readonly handleMap: Map<string, IFluidHandle<LoadableDataObject>> = new Map();

	public get dataObjects(): LoadableDataObject[] {
		return [...this.dataObjectMap.values()];
	}

	public get sharedObjects(): SupportedSharedObjects[] {
		return [...this.sharedObjectMap.values()];
	}

	public get handles(): [string, IFluidHandle<LoadableDataObject>][] {
		return [...this.handleMap.entries()];
	}

	public async hasInitialized(): Promise<void> {
		for (const [key, value] of this.root) {
			if (value.isReferenceHandle === true) {
				const referenceHandle = value as ReferenceHandle;
				this.handleMap.set(key, referenceHandle.handle);
				continue;
			}

			const handle = value as IFluidHandle<SupportedSharedObjects | LoadableDataObject>;
			const child = await handle.get();
			if (child.attributes !== undefined) {
				this.sharedObjectMap.set(key, child);
			} else {
				this.dataObjectMap.set(key, child);
			}
		}
		this.root.on("containedValueChanged", (valueChanged: IValueChanged) => {
			const key = valueChanged.key;
			const value = this.root.get(key);
			if (value.isReferenceHandle === true) {
				const referenceHandle = value as ReferenceHandle;
				this.handleMap.set(key, referenceHandle.handle);
				this.emit("handlesUpdated");
				return;
			}

			const handle = value as IFluidHandle<SupportedSharedObjects | LoadableDataObject>;
			handle
				.get()
				.then((fluidObject) => {
					if (fluidObject.attributes !== undefined) {
						this.sharedObjectMap.set(key, fluidObject);
						this.emit("sharedObjectsUpdated");
					} else {
						this.dataObjectMap.set(key, fluidObject);
						this.emit("dataObjectsUpdated");
					}
				})
				.catch((error) => console.log(error));
		});
	}

	private storeFluidObject(
		key: string,
		fluidObject: SupportedSharedObjects | LoadableDataObject,
	) {
		assert(!this.hasFluidObject(key), "should not be overriding a fluid object");
		this.root.set(key, fluidObject.handle);
	}

	public addReferenceHandle(key: string, handle: IFluidHandle<LoadableDataObject>) {
		assert(!this.hasFluidObject(key), "should not be overriding a fluid object");
		this.root.set(key, new ReferenceHandle(handle));
		this.handleMap.set(key, handle);
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
		this.dataObjectMap.set(key, dataObject);
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

	public getChildDataObject(key: string): LoadableDataObject {
		assert(this.dataObjectMap.has(key), "key should exist in dataObjectMap!");
		const dataObject = this.dataObjectMap.get(key);
		assert(dataObject !== undefined, "should have gotten a dataObject!");
		return dataObject;
	}

	public getHandle(key: string): IFluidHandle<LoadableDataObject> {
		assert(this.handleMap.has(key), "key should exist in handleMap!");
		const handle = this.handleMap.get(key);
		assert(handle !== undefined, "should have gotten a handle!");
		return handle;
	}

	public async toRawLocalDataObject(path: string[]): Promise<LocalDataObject> {
		const type = this.context.packagePath[this.context.packagePath.length - 1];
		const localDataObject = new LocalDataObject(type);
		assert(this.localDataObject === undefined, "overriding localDataObject");
		assert(this._path === undefined, "overriding a path!");
		this._path = [...path];

		// de-fluid DDS
		for (const [key, child] of this.sharedObjectMap.entries()) {
			localDataObject.dataStructures.set(key, toLocalChannel(child));
		}
		for (const [key, child] of this.dataObjectMap.entries()) {
			localDataObject.dataObjects.set(key, await child.toRawLocalDataObject([...path, key]));
		}

		this.localDataObject = localDataObject;
		return localDataObject;
	}

	public async toLocalDataObject(): Promise<LocalDataObject> {
		assert(this.localDataObject !== undefined, "should have called toRawLocalDataObject");
		for (const [key, handle] of this.handleMap.entries()) {
			const dataObject = await handle.get();
			const localHandle = new LocalHandle(dataObject.path);
			this.localDataObject.handles.set(key, localHandle);
		}
		for (const child of this.dataObjects) {
			await child.toLocalDataObject();
		}
		const localDataObject = this.localDataObject;
		this.localDataObject = undefined;

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
		this.localDataObject = localDataObject;
	}

	// SharedObjectHandles considered as references will need to be discussed as a limitation

	public async loadFluidHandles(parentDataObject: LoadableDataObject) {
		assert(this.localDataObject !== undefined, "should have set localDataObject");
		for (const [key, handle] of this.localDataObject.handles) {
			const dataObject = findDataObject(handle.path, parentDataObject);
			this.addReferenceHandle(key, dataObject.handle);
		}
		for (const child of this.dataObjects) {
			await child.loadFluidHandles(parentDataObject);
		}
	}

	public clear() {
		this.localDataObject = undefined;
		this._path = undefined;
		for (const child of this.dataObjects) {
			child.clear();
		}
	}
}
