/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IInventoryList,
	IInventoryListAppModel,
	IMigrateBackingData,
} from "../modelInterfaces.js";

/**
 * The InventoryListAppModel just provides the inventory list, which is also capable of migrating its backing data.
 */
export class InventoryListAppModel implements IInventoryListAppModel {
	public constructor(
		public readonly migratingInventoryList: IInventoryList & IMigrateBackingData,
	) {}
}
