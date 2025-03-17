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

import type { IBlobMap, IBlobMapEvents, IBlobRecord } from "./interface.js";

type UploadArrayBufferFn = (blob: ArrayBufferLike) => Promise<IFluidHandle<ArrayBufferLike>>;

/**
 * The BlobMap is our data object that implements the IBlobMap interface.
 */
class BlobMap implements IBlobMap {
	private readonly blobMap = new Map<string, Blob>();
	private readonly blobs: IBlobRecord[] = [];

	private readonly _events = new TypedEventEmitter<IBlobMapEvents>();
	public get events(): IEventProvider<IBlobMapEvents> {
		return this._events;
	}

	public constructor(
		private readonly sharedMap: ISharedMap,
		private readonly uploadArrayBuffer: UploadArrayBufferFn,
	) {
		this.sharedMap.on("valueChanged", (changed: IValueChanged) => {
			const handle = this.sharedMap.get(changed.key);
			handle.get().then((arrayBuffer: ArrayBufferLike) => {
				this.blobMap.set(changed.key, new Blob([arrayBuffer]));
				this.blobs.push({
					id: changed.key,
					blob: new Blob([arrayBuffer]),
				});
				// Sort in case timestamps disagree with map insertion order
				this.blobs.sort((a, b) => a.id.localeCompare(b.id, "en", { sensitivity: "base" }));
				this._events.emit("blobsChanged");
			});
		});
	}

	public readonly getBlobs = () => {
		return this.blobs;
	};

	public readonly addBlob = (blob: Blob) => {
		blob
			.arrayBuffer()
			.then(this.uploadArrayBuffer)
			.then((handle) => {
				// Use timestamp as a hack for a consistent sortable order.
				this.sharedMap.set(`${Date.now()}-${uuid()}`, handle);
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
			return new BlobMap(map, async (arrayBuffer: ArrayBufferLike) =>
				entryPointRuntime.uploadBlob(arrayBuffer),
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
