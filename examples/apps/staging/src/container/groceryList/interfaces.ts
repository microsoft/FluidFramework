/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

// #region GroceryList
/**
 * Interfaces for the GroceryList data object.
 */

export interface IGroceryItem {
	readonly id: string;
	readonly name: string;
	readonly removeItem: () => void;
}

export interface IGroceryListEvents extends IEvent {
	(event: "itemAdded" | "itemRemoved", listener: (item: IGroceryItem) => void);
	(event: "disposed", listener: () => void);
}

export interface IGroceryList {
	readonly events: IEventProvider<IGroceryListEvents>;

	readonly addItem: (name: string) => void;
	readonly getItems: () => IGroceryItem[];
	readonly removeItem: (id: string) => void;

	readonly disposed: boolean;
}

// #region Runtime
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
