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

import type { IBlobCollection, IBlobCollectionEvents, IBlobRecord } from "./interface.js";

type UploadArrayBufferFn = (blob: ArrayBufferLike) => Promise<IFluidHandle<ArrayBufferLike>>;

/**
 * The BlobCollection is our data object that implements the IBlobCollection interface.
 */
class BlobCollection implements IBlobCollection {
	// The blobs member mirrors the contents of the sharedMap (pending the fetching of the Blobs).
	// As a result it lags the sharedMap slightly (as the Blobs are fetched) but in exchange it provides
	// synchronous access to the Blobs, which is convenient at the view layer.  We keep it sorted by
	// id so that all clients observe a consistent ordering.
	private readonly blobs: IBlobRecord[] = [];

	private readonly _events = new TypedEventEmitter<IBlobCollectionEvents>();
	public get events(): IEventProvider<IBlobCollectionEvents> {
		return this._events;
	}

	public constructor(
		private readonly sharedMap: ISharedMap,
		// We can take a partially applied function for uploading blobs rather than the whole IFluidDataStoreRuntime.
		private readonly uploadArrayBuffer: UploadArrayBufferFn,
	) {
		const trackBlob = (key: string) => {
			const handle = this.sharedMap.get(key);
			handle.get().then((arrayBuffer: ArrayBufferLike) => {
				const newBlob: IBlobRecord = {
					id: key,
					// Blobs in Fluid are retrieved as ArrayBuffers, this translates it back to a Blob
					blob: new Blob([arrayBuffer]),
				};
				this.blobs.push(newBlob);
				// Sort in case timestamps disagree with map insertion order
				this.blobs.sort((a, b) => a.id.localeCompare(b.id, "en", { sensitivity: "base" }));
				this._events.emit("blobAdded", newBlob);
			});
		};
		// Watch for incoming new blobs
		this.sharedMap.on("valueChanged", (changed: IValueChanged) => {
			trackBlob(changed.key);
		});
		// Track the blobs that are already in the map
		for (const key of this.sharedMap.keys()) {
			trackBlob(key);
		}
	}

	public readonly getBlobs = () => {
		return this.blobs;
	};

	public readonly addBlob = (blob: Blob) => {
		// IFluidDataStoreRuntime.uploadBlob takes an ArrayBufferLike, but this data store wants
		// to expose an interface that uses Blob (because that is convenient to use with Canvas).
		// This function translates from Blob to ArrayBuffer before uploading.
		blob
			.arrayBuffer()
			.then(this.uploadArrayBuffer)
			.then((handle) => {
				// Use timestamp as a hack for a consistent sortable order.
				this.sharedMap.set(`${Date.now()}-${crypto.randomUUID()}`, handle);
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
