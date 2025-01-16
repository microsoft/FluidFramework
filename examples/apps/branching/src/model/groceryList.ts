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
} from "../modelInterfaces.js";

/**
 * GroceryItem is the local object with a friendly interface for the view to use.
 * It wraps a new SharedTree node representing a grocery item to abstract out the DDS manipulation and access.
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
		// TODO:  Consider just specifying what the data object requires rather than taking a full runtime.
		private readonly disposableParent: IDisposableParent,
		public readonly handle: IFluidHandle<FluidObject>,
		private readonly map: ISharedMap,
		public readonly branch: () => Promise<IGroceryList>,
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
		this.map.set(uuid(), name);
	};

	public readonly getItems = (): IGroceryItem[] => {
		return [...this._groceryItems.values()];
	};

	private readonly onMapValueChanged = (changed: IValueChanged) => {
		const changedId = changed.key;
		const newName = this.map.get(changedId);
		if (newName === undefined) {
			this._groceryItems.delete(changedId);
			this._events.emit("itemDeleted");
		} else {
			const newGroceryItem = new GroceryItem(changedId, newName, () => {
				this.map.delete(changedId);
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

	// Effectively, this pattern puts the factory in charge of "unpacking" the context, getting everything ready to assemble the MigrationTool
	// As opposed to the MigrationTool instance having an initialize() method to be called after the fact that does the unpacking.
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
			map.set(uuid(), "apple");
			map.set(uuid(), "banana");
			map.set(uuid(), "chocolate");
			map.bindToContext();
		}

		assert(runtime.entryPoint !== undefined, "EntryPoint was undefined");
		const handle = runtime.entryPoint;

		// TODO: Use actual branching.  This is currently just creating a detached map and copying the data over.
		const branchMap = (originalMap: ISharedMap) => {
			const branchedMap = runtime.createChannel(uuid(), mapFactory.type) as ISharedMap;
			for (const [key, value] of originalMap) {
				branchedMap.set(key, value);
			}
			return branchedMap;
		};

		const branch = async () => {
			const branchedMap = branchMap(map);
			// TODO: Should there be a working handle here?  What would that mean?
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			return new GroceryList(runtime, {} as IFluidHandle<FluidObject>, branchedMap, () => {
				throw new Error("Double-branching not supported right now");
			});
		};

		// By this point, we've performed any async work required to get the dependencies of the MigrationTool,
		// so just a normal sync constructor will work fine (no followup async initialize()).
		const instance = new GroceryList(runtime, handle, map, branch);

		return runtime;
	}
}
