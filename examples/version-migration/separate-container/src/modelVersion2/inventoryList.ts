/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "@fluid-example/example-utils";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { type ISharedMap, SharedMap } from "@fluidframework/map/legacy";
import { type ISharedString, SharedString } from "@fluidframework/sequence/legacy";
import { v4 as uuid } from "uuid";

import type { IInventoryItem, IInventoryList } from "../modelInterfaces.js";

const quantityKey = "quantity";

interface IStoredInventoryItem {
	name: IFluidHandle<ISharedString>;
	quantity: IFluidHandle<ISharedMap>;
}

class InventoryItem extends EventEmitter implements IInventoryItem {
	public get id(): string {
		return this._id;
	}
	// Probably would be nice to not hand out the SharedString, but the CollaborativeInput expects it.
	public get name(): ISharedString {
		return this._name;
	}
	public get quantity(): number {
		const mapValue = this._quantity.get<number>(quantityKey);
		if (mapValue === undefined) {
			throw new Error("Expected a valid quantity");
		}
		return mapValue;
	}
	public set quantity(newValue: number) {
		this._quantity.set(quantityKey, newValue);
	}
	public constructor(
		private readonly _id: string,
		private readonly _name: ISharedString,
		private readonly _quantity: ISharedMap,
	) {
		super();
		// this._name.on("sequenceDelta", () =>{
		//     this.emit("nameChanged");
		// });
		this._quantity.on("valueChanged", () => {
			this.emit("quantityChanged");
		});
	}
}

// type InventoryItemData = { name: IFluidHandle<SharedString>, quantity: IFluidHandle<SharedMap> };

/**
 * The InventoryList is our data object that implements the IInventoryList interface.
 */
export class InventoryList extends DataObject implements IInventoryList {
	private readonly inventoryItems = new Map<string, InventoryItem>();

	public readonly addItem = (name: string, quantity: number): void => {
		const nameString = SharedString.create(this.runtime);
		nameString.insertText(0, name);
		const quantityMap: SharedMap = SharedMap.create(this.runtime);
		quantityMap.set(quantityKey, quantity);
		const id = uuid();
		this.root.set(id, { name: nameString.handle, quantity: quantityMap.handle });
	};

	public readonly deleteItem = (id: string): void => {
		this.root.delete(id);
	};

	public readonly getItems = (): IInventoryItem[] => {
		return [...this.inventoryItems.values()];
	};

	public readonly getItem = (id: string): IInventoryItem | undefined => {
		return this.inventoryItems.get(id);
	};

	private readonly handleItemAdded = async (id: string): Promise<void> => {
		// We expect this stored inventory item must exist because this handler is run in response to
		// the given id being the subject of a valueChanged event.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const itemData = this.root.get<IStoredInventoryItem>(id)!;
		const [nameSharedString, quantitySharedMap] = await Promise.all([
			itemData.name.get(),
			itemData.quantity.get(),
		]);
		// It's possible the item was deleted while getting the name/quantity, in which case quietly exit.
		if (this.root.get(id) === undefined) {
			return;
		}
		const newInventoryItem = new InventoryItem(id, nameSharedString, quantitySharedMap);
		this.inventoryItems.set(id, newInventoryItem);
		this.emit("itemAdded", newInventoryItem);
	};

	private readonly handleItemDeleted = (id: string): void => {
		const deletedItem = this.inventoryItems.get(id);
		this.inventoryItems.delete(id);
		this.emit("itemDeleted", deletedItem);
	};

	/**
	 * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
	 * DataObject, by registering an event listener for changes to the inventory list.
	 */
	protected async hasInitialized(): Promise<void> {
		this.root.on("valueChanged", (changed) => {
			if (changed.previousValue === undefined) {
				// Must be from adding a new item
				this.handleItemAdded(changed.key).catch((error) => {
					console.error(error);
				});
			} else if (this.root.get(changed.key) === undefined) {
				// Must be from a deletion
				this.handleItemDeleted(changed.key);
			} else {
				// Since all data modifications happen within the SharedString or SharedMap, the root directory
				// should never see anything except adds and deletes.
				console.error("Unexpected modification to inventory list");
			}
		});

		for (const [id, itemData] of this.root.entries() as IterableIterator<
			[string, IStoredInventoryItem]
		>) {
			const [nameSharedString, quantitySharedMap] = await Promise.all([
				itemData.name.get(),
				itemData.quantity.get(),
			]);
			this.inventoryItems.set(id, new InventoryItem(id, nameSharedString, quantitySharedMap));
		}
	}
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const InventoryListInstantiationFactory = new DataObjectFactory<InventoryList>(
	"inventory-list",
	InventoryList,
	[SharedMap.getFactory(), SharedString.getFactory()],
	{},
);
