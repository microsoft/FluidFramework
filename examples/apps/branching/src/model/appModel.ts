/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IGroceryList, IGroceryListAppModel } from "../modelInterfaces.js";

/**
 * The InventoryListAppModel provides two inventory lists, one using legacy SharedTree
 * and the other using new SharedTree.  They function the same and share the same interface.
 */
export class GroceryListAppModel implements IGroceryListAppModel {
	public constructor(public readonly groceryList: IGroceryList) {}
}
