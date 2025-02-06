/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	FluidObject,
	IEventProvider,
	IFluidHandle,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/legacy";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/legacy";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/legacy";
import { type ISharedMap, type IValueChanged, MapFactory } from "@fluidframework/map/legacy";
import type {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/legacy";
import { v4 as uuid } from "uuid";

import type {
	IDisposableParent,
	IGroceryItem,
	IGroceryList,
	IGroceryListEvents,
} from "./interfaces.js";

/**
 * GroceryItem is the local object with a friendly interface for the view to use.
 * It conceals the DDS manipulation and access, and exposes a more-convenient surface
 * for working with a single item.
 */
class GroceryItem implements IGroceryItem {
	public constructor(
		public readonly id: string,
		public readonly name: string,
		public readonly deleteItem: () => void,
	) {}
}

class GroceryList implements IGroceryList {
	private readonly _groceryItems = new Map<string, GroceryItem>();

	private _disposed = false;

	public get disposed(): boolean {
		return this._disposed;
	}

	private readonly _events = new TypedEventEmitter<IGroceryListEvents>();
	public get events(): IEventProvider<IGroceryListEvents> {
		return this._events;
	}

	public constructor(
		private readonly disposableParent: IDisposableParent,
		public readonly handle: IFluidHandle<FluidObject>,
		private readonly map: ISharedMap,
	) {
		if (this.disposableParent.disposed) {
			this.dispose();
		} else {
			this.disposableParent.once("dispose", this.dispose);
			this.map.on("valueChanged", this.onMapValueChanged);

			for (const [id, groceryName] of this.map) {
				const preExistingGroceryItem = new GroceryItem(id, groceryName, () => {
					this.map.delete(id);
				});
				this._groceryItems.set(id, preExistingGroceryItem);
			}
		}
	}

	public readonly addItem = (name: string) => {
		// Use timestamp as a hack for a consistent sortable order.
		const id = `${Date.now()}-${uuid()}`;
		this.map.set(id, name);
		return id;
	};

	public readonly getItems = (): IGroceryItem[] => {
		const groceryItems = [...this._groceryItems.values()];
		groceryItems.sort((a, b) => a.id.localeCompare(b.id, "en", { sensitivity: "base" }));
		return [...this._groceryItems.values()];
	};

	public readonly removeItem = (id: string) => {
		this.map.delete(id);
	};

	private readonly onMapValueChanged = (changed: IValueChanged) => {
		const changedId = changed.key;
		const newName = this.map.get(changedId);
		if (newName === undefined) {
			this._groceryItems.delete(changedId);
			this._events.emit("itemDeleted");
		} else {
			const newGroceryItem = new GroceryItem(changedId, newName, () => {
				this.removeItem(changedId);
			});
			this._groceryItems.set(changedId, newGroceryItem);
			this._events.emit("itemAdded");
		}
	};

	/**
	 * Called when the host container closes and disposes itself
	 */
	private readonly dispose = (): void => {
		this._disposed = true;
		this.map.off("valueChanged", this.onMapValueChanged);
		this._events.emit("disposed");
	};
}

const mapId = "grocery-list";

const mapFactory = new MapFactory();
const groceryListSharedObjectRegistry = new Map<string, IChannelFactory>([
	[mapFactory.type, mapFactory],
]);

export class GroceryListFactory implements IFluidDataStoreFactory {
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
		const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
			context,
			groceryListSharedObjectRegistry,
			existing,
			async () => instance,
		);

		let map: ISharedMap;
		if (existing) {
			map = (await runtime.getChannel(mapId)) as ISharedMap;
		} else {
			map = runtime.createChannel(mapId, mapFactory.type) as ISharedMap;
			// Use timestamp as a hack for a consistent sortable order.
			const timestamp = Date.now();
			map.set(`${timestamp}-${uuid()}`, "apple");
			map.set(`${timestamp + 1}-${uuid()}`, "banana");
			map.set(`${timestamp + 2}-${uuid()}`, "chocolate");
			map.bindToContext();
		}

		assert(runtime.entryPoint !== undefined, "EntryPoint was undefined");
		const handle = runtime.entryPoint;

		const instance = new GroceryList(runtime, handle, map);

		return runtime;
	}
}
