/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

export interface IDisposableEvents extends IEvent {
	// Note that IFluidDataStoreRuntime calls the event "dispose" rather than "disposed"
	(event: "dispose", listener: () => void);
}

// TODO: Don't extend IEventProvider.
export interface IDisposableParent extends IEventProvider<IDisposableEvents> {
	readonly disposed: boolean;
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

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type GroceryListItemJSON = { id: string; name: string };
export type GroceryListJSON = GroceryListItemJSON[];
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type GroceryListJSONDiff = {
	adds: GroceryListItemJSON[];
	removals: GroceryListItemJSON[];
};

export interface IGroceryList {
	readonly events: IEventProvider<IGroceryListEvents>;

	readonly addItem: (name: string) => void;
	readonly getItems: () => IGroceryItem[];
	readonly deleteItem: (id: string) => void;

	readonly exportJSONString: () => string;
}
