/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

// #region SuggestionGroceryList interfaces
/**
 * Interfaces for the SuggestionGroceryList class
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
