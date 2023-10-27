/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEmitter } from "tiny-typed-emitter";
import type {
	IInventoryList,
	IInventoryListAppModel,
	IInventoryListAppModelEvents,
} from "../modelInterfaces";

/**
 * The InventoryListAppModel provides two inventory lists, one using legacy SharedTree
 * and the other using new SharedTree.  They function the same and share the same interface.
 */
export class InventoryListAppModel
	extends TypedEmitter<IInventoryListAppModelEvents>
	implements IInventoryListAppModel
{
	public constructor(
		public readonly legacyTreeInventoryList: IInventoryList,
		public readonly newTreeInventoryList: IInventoryList,
		public readonly DEBUG_triggerMigration: () => void,
	) {
		super();
		// inventoryList.on("migrationFinished", () => { this.emit("inventoryListChanged"); });
	}
}
