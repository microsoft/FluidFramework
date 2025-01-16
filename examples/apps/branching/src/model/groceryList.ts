/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { TypedEmitter } from "tiny-typed-emitter";
import { v4 as uuid } from "uuid";

import type { IGroceryItem, IGroceryItemEvents, IGroceryList } from "../modelInterfaces.js";

/**
 * NewTreeInventoryItem is the local object with a friendly interface for the view to use.
 * It wraps a new SharedTree node representing an inventory item to abstract out the tree manipulation and access.
 */
class GroceryItem extends TypedEmitter<IGroceryItemEvents> implements IGroceryItem {
	public constructor(
		public readonly id: string,
		public readonly name: string,
		private readonly _removeItemFromTree: () => void,
	) {
		super();
	}
	public readonly deleteItem = () => {
		this._removeItemFromTree();
	};
}

export class GroceryList extends DataObject implements IGroceryList {
	private readonly _groceryItems = new Map<string, GroceryItem>();

	public readonly addItem = (name: string) => {
		this.root.set(uuid(), name);
	};

	public readonly getItems = (): IGroceryItem[] => {
		return [...this._groceryItems.values()];
	};

	protected async initializingFirstTime(): Promise<void> {
		this.root.set(uuid(), "apple");
		this.root.set(uuid(), "banana");
	}

	protected async hasInitialized(): Promise<void> {
		this.root.on("valueChanged", (changed) => {
			const changedId = changed.key;
			const newName = this.root.get(changedId);
			if (newName === undefined) {
				this._groceryItems.delete(changedId);
				this.emit("itemDeleted");
			} else {
				const newGroceryItem = new GroceryItem(changedId, newName, () => {
					this.root.delete(changedId);
				});
				this._groceryItems.set(changedId, newGroceryItem);
				this.emit("itemAdded");
			}
		});
		for (const [id, groceryName] of this.root) {
			const preExistingGroceryItem = new GroceryItem(id, groceryName, () => {
				this.root.delete(id);
			});
			this._groceryItems.set(id, preExistingGroceryItem);
		}
	}
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const GroceryListFactory = new DataObjectFactory<GroceryList>(
	"grocery-list",
	GroceryList,
	[],
	{},
);
