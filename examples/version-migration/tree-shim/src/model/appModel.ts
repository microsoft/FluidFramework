/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IInventoryList,
	IInventoryListAppModel,
	IMigrateBackingData,
} from "../modelInterfaces";

/**
 * The InventoryListAppModel just provides the inventoryList.
 */
export class InventoryListAppModel implements IInventoryListAppModel {
	public constructor(
		public readonly migratingInventoryList: IInventoryList & IMigrateBackingData,
	) {}
}
