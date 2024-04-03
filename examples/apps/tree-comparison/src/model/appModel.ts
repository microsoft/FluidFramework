/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IInventoryList, IInventoryListAppModel } from "../modelInterfaces.js";

/**
 * The InventoryListAppModel provides two inventory lists, one using legacy SharedTree
 * and the other using new SharedTree.  They function the same and share the same interface.
 */
export class InventoryListAppModel implements IInventoryListAppModel {
	public constructor(
		public readonly legacyTreeInventoryList: IInventoryList,
		public readonly newTreeInventoryList: IInventoryList,
	) {}
}
