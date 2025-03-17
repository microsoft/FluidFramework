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

import type { IBlobCollection, IBlobCollectionEvents, IBlobRecord } from "./interface.js";

type UploadArrayBufferFn = (blob: ArrayBufferLike) => Promise<IFluidHandle<ArrayBufferLike>>;

/**
 * The BlobCollection is our data object that implements the IBlobCollection interface.
 */
class BlobCollection implements IBlobCollection {
	private readonly blobs: IBlobRecord[] = [];

	private readonly _events = new TypedEventEmitter<IBlobCollectionEvents>();
	public get events(): IEventProvider<IBlobCollectionEvents> {
		return this._events;
	}

	public constructor(
		private readonly sharedMap: ISharedMap,
		private readonly uploadArrayBuffer: UploadArrayBufferFn,
	) {
		this.sharedMap.on("valueChanged", (changed: IValueChanged) => {
			const handle = this.sharedMap.get(changed.key);
			handle.get().then((arrayBuffer: ArrayBufferLike) => {
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

export class BlobCollectionFactory implements IFluidDataStoreFactory {
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
			return new BlobCollection(map, async (arrayBuffer: ArrayBufferLike) =>
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
