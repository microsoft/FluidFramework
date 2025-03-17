/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IEventProvider, IFluidHandle } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/legacy";
import type {
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/legacy";
import { MapFactory, type ISharedMap, type IValueChanged } from "@fluidframework/map/legacy";
import type {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/legacy";
import { v4 as uuid } from "uuid";

import type { IBlobMap, IBlobMapEvents } from "./interface.js";

type UploadBlobFn = (blob: ArrayBufferLike) => Promise<IFluidHandle<ArrayBufferLike>>;

/**
 * The BlobMap is our data object that implements the IBlobMap interface.
 */
class BlobMap implements IBlobMap {
	private readonly _events = new TypedEventEmitter<IBlobMapEvents>();
	public get events(): IEventProvider<IBlobMapEvents> {
		return this._events;
	}

	public constructor(
		private readonly map: ISharedMap,
		private readonly uploadBlob: UploadBlobFn,
	) {
		this.map.on("valueChanged", (changed: IValueChanged) => {
			this._events.emit("blobsChanged");
		});
	}

	public readonly getBlobs = () => {
		return this.map;
	};

	public readonly addBlob = (blob: ArrayBufferLike) => {
		this.uploadBlob(blob)
			.then((handle) => {
				this.map.set(uuid(), handle);
			})
			.catch(console.error);
	};
}

const mapId = "blob-map";
const mapFactory = new MapFactory();
const sharedObjectRegistry = new Map<string, IChannelFactory>([[mapFactory.type, mapFactory]]);

export class BlobMapFactory implements IFluidDataStoreFactory {
	public get type(): string {
		throw new Error("Do not use the type on the data store factory");
	}

	public get IFluidDataStoreFactory(): IFluidDataStoreFactory {
		return this;
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<IFluidDataStoreChannel> {
		const provideEntryPoint = async (entryPointRuntime: IFluidDataStoreRuntime) => {
			const map = (await entryPointRuntime.getChannel(mapId)) as ISharedMap;
			return new BlobMap(map, async (blob: ArrayBufferLike) =>
				entryPointRuntime.uploadBlob(blob),
			);
		};

		const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
			context,
			sharedObjectRegistry,
			existing,
			provideEntryPoint,
		);

		if (!existing) {
			const map = runtime.createChannel(mapId, mapFactory.type) as ISharedMap;
			map.bindToContext();
		}

		return runtime;
	}
}
