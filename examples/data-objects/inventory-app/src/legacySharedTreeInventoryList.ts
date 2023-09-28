/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedTree as LegacySharedTree } from "@fluid-experimental/tree";
import { TypedEmitter } from "tiny-typed-emitter";

import { IInventoryList, IInventoryListEvents, IPart } from "./interfaces";

/**
 * Adapts a given LegacySharedTree into the interface we want to use for an inventory list, IInventoyrList.
 */
export class LegacySharedTreeInventoryList
	extends TypedEmitter<IInventoryListEvents>
	implements IInventoryList
{
	// private readonly _inventory: Inventory;
	// Feels bad to give out the whole LegacySharedTree.  Is there something more scoped to pass (root or something)?
	public constructor(tree: LegacySharedTree) {
		super();

		// const sharedTreeView = tree.schematize(schemaPolicy);
		// this._inventory = sharedTreeView.context.root[0] as unknown as Inventory;
		// sharedTreeView.events.on("afterBatch", () => {
		// 	this.emit("inventoryChanged");
		// });
	}

	public getParts() {
		const parts: IPart[] = [];
		// for (const part of this._inventory.parts) {
		// 	parts.push({
		// 		name: part.name,
		// 		quantity: part.quantity,
		// 		increment: () => {
		// 			part.quantity++;
		// 		},
		// 		decrement: () => {
		// 			part.quantity--;
		// 		},
		// 	});
		// }
		return parts;
	}
}
