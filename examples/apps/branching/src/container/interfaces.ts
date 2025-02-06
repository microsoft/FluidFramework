/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

// #region GroceryListChanges
/**
 * Interfaces for extracting and diffing grocery list data.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type GroceryListItemPOJO = { id: string; name: string };
export type GroceryListPOJO = GroceryListItemPOJO[];
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type GroceryListChanges = {
	adds: GroceryListItemPOJO[];
	removals: GroceryListItemPOJO[];
};

// #region SuggestionGroceryList
/**
 * Interfaces for the SuggestionGroceryList class.
 */

export type SuggestionState = "none" | "add" | "remove";

export interface ISuggestionGroceryItem {
	readonly id: string;
	readonly name: string;
	readonly suggestion: SuggestionState;
	readonly removeItem: () => void;
}

export interface ISuggestionGroceryListEvents extends IEvent {
	(
		event: "itemAdded" | "itemRemoved" | "itemSuggestionChanged",
		listener: (item: ISuggestionGroceryItem) => void,
	);
	(event: "enterStagingMode" | "leaveStagingMode", listener: () => void);
	(event: "disposed", listener: () => void);
}

export interface ISuggestionGroceryList {
	readonly events: IEventProvider<ISuggestionGroceryListEvents>;

	readonly inStagingMode: boolean;

	readonly addItem: (name: string) => void;
	readonly getItems: () => ISuggestionGroceryItem[];
	readonly removeItem: (id: string) => void;

	readonly getSuggestions: () => void;
	readonly acceptSuggestions: () => void;
	readonly rejectSuggestions: () => void;
}
