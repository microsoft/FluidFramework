/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

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

export interface IGroceryItem {
	readonly id: string;
	readonly name: string;
	readonly deleteItem: () => void;
}

export interface IGroceryListEvents extends IEvent {
	(event: "itemAdded" | "itemDeleted", listener: (item: IGroceryItem) => void);
	(event: "disposed", listener: () => void);
}

/**
 * IInventoryList describes the public API surface for our inventory list object.
 */
export interface IGroceryList {
	readonly events: IEventProvider<IGroceryListEvents>;

	readonly addItem: (name: string) => void;

	readonly getItems: () => IGroceryItem[];
}
