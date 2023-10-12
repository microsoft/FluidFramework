/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IInventoryListAppModel, IInventoryList } from "../modelInterfaces";

/**
 * The InventoryListAppModel serves the purpose of wrapping this particular Container in a friendlier interface,
 * with stronger typing and accessory functionality.  It should have the same layering restrictions as we want for
 * the Container (e.g. no direct access to the Loader).  It does not have a goal of being general-purpose like
 * Container does -- instead it is specially designed for the specific container code.
 */
export class InventoryListAppModel implements IInventoryListAppModel {
	public constructor(
		public readonly legacyTreeInventoryList: IInventoryList,
		public readonly treeInventoryList: IInventoryList,
	) {}
}
