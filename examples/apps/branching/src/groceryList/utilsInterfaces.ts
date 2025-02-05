/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type GroceryListItemPOJO = { id: string; name: string };
export type GroceryListPOJO = GroceryListItemPOJO[];
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type GroceryListModifications = {
	adds: GroceryListItemPOJO[];
	removals: GroceryListItemPOJO[];
};
