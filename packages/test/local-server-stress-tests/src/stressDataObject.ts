/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { stringToBuffer } from "@fluid-internal/client-utils";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import {
	AttachState,
	type IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { FluidObject } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import type { IDataStore } from "@fluidframework/runtime-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";

export class StressDataObject extends DataObject {
	get StressDataObject() {
		return this;
	}

	protected _globalObjects: Record<
		string,
		| { type: "newBlob"; handle: IFluidHandle<ArrayBufferLike> }
		| { type: "newDatastore"; dataStore: IDataStore; handle: IFluidHandle }
		| {
				type: "stressDataObject";
				StressDataObject: StressDataObject;
				handle: IFluidHandle;
		  }
		| { type: "newAlias"; alias: string }
	> = {};

	public get globalObjects(): Readonly<
		Record<
			string,
			| { type: "newBlob"; handle: IFluidHandle<ArrayBufferLike> }
			| { type: "newDatastore"; dataStore: IDataStore; handle: IFluidHandle }
			| {
					type: "stressDataObject";
					StressDataObject: StressDataObject;
					handle: IFluidHandle;
			  }
			| { type: "newAlias"; alias: string; handle?: undefined }
		>
	> {
		return this._globalObjects;
	}

	protected async getDefaultStressDataObject() {
		const root = await this.context.containerRuntime.getAliasedDataStoreEntryPoint("default");
		assert(root !== undefined, "default must exist");

		const maybe: FluidObject<StressDataObject> | undefined = await root.get();
		assert(maybe.StressDataObject !== undefined, "must be StressDataObject");
		return maybe.StressDataObject;
	}

	public get attached() {
		return this.runtime.attachState === AttachState.Attached;
	}

	public channels: Record<string, IChannel[]> = {};

	protected async preInitialize(): Promise<void> {
		const root = await this.getDefaultStressDataObject();

		this._globalObjects = root._globalObjects;

		const channels = (this.channels[this.root.attributes.type] ??= []);
		channels.push(this.root);

		setTimeout(() => {
			this._globalObjects[this.id] = {
				type: "stressDataObject",
				StressDataObject: this,
				handle: this.handle,
			};
		}, 0);
	}

	public uploadBlob(contents: string) {
		void this.runtime.uploadBlob(stringToBuffer(contents, "utf-8")).then(
			(blobHandle) =>
				(this._globalObjects[toFluidHandleInternal(blobHandle).absolutePath] = {
					type: "newBlob",
					handle: blobHandle,
				}),
		);
	}

	public createDataStore() {
		void this.context.containerRuntime
			.createDataStore(stressDataObjectFactory.type)
			.then(async (dataStore) => {
				this._globalObjects[dataStore.entryPoint.absolutePath] = {
					type: "newDatastore",
					dataStore,
					handle: dataStore.entryPoint,
				};
			});
	}
}

const stressDataObjectFactory = new DataObjectFactory(
	"StressDataObject",
	StressDataObject,
	undefined,
	{},
);

class DefaultStressDataObject extends StressDataObject {
	public static readonly alias = "default";

	protected override async getDefaultStressDataObject(): Promise<StressDataObject> {
		return this;
	}

	protected async preInitialize(): Promise<void> {
		const channels = (this.channels[this.root.attributes.type] ??= []);
		channels.push(this.root);
		this._globalObjects[this.id] = {
			type: "stressDataObject",
			StressDataObject: this,
			handle: this.handle,
		};
		this._globalObjects.default = { type: "newAlias", alias: DefaultStressDataObject.alias };
	}
}

export const defaultStressDataObjectFactory = new DataObjectFactory(
	"DefaultStressDataObject",
	DefaultStressDataObject,
	undefined,
	{},
);

export const runtimeFactory: IRuntimeFactory = {
	get IRuntimeFactory() {
		return this;
	},
	instantiateRuntime: async (context, existing) => {
		return loadContainerRuntime({
			context,
			existing,
			registryEntries: [
				[defaultStressDataObjectFactory.type, Promise.resolve(defaultStressDataObjectFactory)],
				[stressDataObjectFactory.type, Promise.resolve(stressDataObjectFactory)],
			],
			provideEntryPoint: async (rt) => {
				const maybeDefault = await rt.getAliasedDataStoreEntryPoint(
					DefaultStressDataObject.alias,
				);
				if (maybeDefault === undefined) {
					const ds = await rt.createDataStore(defaultStressDataObjectFactory.type);
					await ds.trySetAlias(DefaultStressDataObject.alias);
				}
				const aliasedDefault = await rt.getAliasedDataStoreEntryPoint(
					DefaultStressDataObject.alias,
				);
				assert(aliasedDefault !== undefined, "default must exist");

				const maybe: FluidObject<StressDataObject> | undefined = await aliasedDefault.get();
				return maybe;
			},
		});
	},
};
