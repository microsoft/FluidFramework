/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventEmitter } from "@fluid-example/example-utils";
import { TypedEmitter } from "tiny-typed-emitter";

/**
 * For demo purposes this is a super-simple interface, but in a real scenario this should have all relevant surface
 * for the application to run.
 */
export interface IGroceryListAppModel {
	/**
	 * An inventory tracker list using the new shared tree.
	 */
	readonly groceryList: IGroceryList;
}

export interface IGroceryItemEvents {
	quantityChanged: () => void;
}

export interface IGroceryItem extends TypedEmitter<IGroceryItemEvents> {
	readonly id: string;
	readonly name: string;
	readonly deleteItem: () => void;
}

/**
 * IInventoryList describes the public API surface for our inventory list object.
 */
export interface IGroceryList extends EventEmitter {
	readonly addItem: (name: string) => void;

	readonly getItems: () => IGroceryItem[];

	/**
	 * The listChanged event will fire whenever an item is added/removed, either locally or remotely.
	 * TODO: Consider using tiny-typed-emitter if not using DataObject
	 */
	on(event: "itemAdded" | "itemDeleted", listener: (item: IGroceryItem) => void): this;
}
