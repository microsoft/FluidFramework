/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

// #region GroceryList interfaces
/**
 * Interfaces for the GroceryList data object.
 */

export interface IGroceryItem {
	readonly id: string;
	readonly name: string;
	readonly deleteItem: () => void;
}

export interface IGroceryListEvents extends IEvent {
	(event: "itemAdded" | "itemDeleted", listener: (item: IGroceryItem) => void);
	(event: "disposed", listener: () => void);
}

export interface IGroceryList {
	readonly events: IEventProvider<IGroceryListEvents>;

	readonly addItem: (name: string) => string;
	readonly getItems: () => IGroceryItem[];
	readonly removeItem: (id: string) => void;
}

// #region Utils interfaces
/**
 * Interfaces used for extracting, diffing, and applying changes to an IGroceryList.
 */

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type GroceryListItemPOJO = { id: string; name: string };
export type GroceryListPOJO = GroceryListItemPOJO[];
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type GroceryListChanges = {
	adds: GroceryListItemPOJO[];
	removals: GroceryListItemPOJO[];
};

// #region Runtime interfaces
/**
 * Interfaces that really should probably be in some runtime package instead.  Describe runtime objects
 * with scoped capabilities.
 */

export interface IDisposableEvents extends IEvent {
	// Note that IFluidDataStoreRuntime calls the event "dispose" rather than "disposed"
	(event: "dispose", listener: () => void);
}

// TODO: Don't extend IEventProvider.
export interface IDisposableParent extends IEventProvider<IDisposableEvents> {
	readonly disposed: boolean;
}
