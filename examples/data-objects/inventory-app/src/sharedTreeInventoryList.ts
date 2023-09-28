/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AllowedUpdateType, ISharedTree } from "@fluid-experimental/tree2";
import { TypedEmitter } from "tiny-typed-emitter";

import { IInventoryList, IInventoryListEvents, IPart } from "./interfaces";
import { Inventory, schema } from "./schema";

const schemaPolicy = {
	schema,
	initialTree: {
		parts: [
			{
				name: "nut",
				quantity: 0,
			},
			{
				name: "bolt",
				quantity: 0,
			},
		],
	},
	allowedSchemaModifications: AllowedUpdateType.None,
};

/**
 * Adapts a given ISharedTree into the interface we want to use for an inventory list, IInventoyrList.
 */
export class SharedTreeInventoryList
	extends TypedEmitter<IInventoryListEvents>
	implements IInventoryList
{
	private readonly _inventory: Inventory;
	// Feels bad to give out the whole ISharedTree.  Should I just pass an ISharedTreeView?
	public constructor(tree: ISharedTree) {
		super();

		const sharedTreeView = tree.schematize(schemaPolicy);
		this._inventory = sharedTreeView.context.root[0] as unknown as Inventory;
		sharedTreeView.events.on("afterBatch", () => {
			this.emit("inventoryChanged");
		});
	}

	public getParts() {
		const parts: IPart[] = [];
		for (const part of this._inventory.parts) {
			parts.push({
				name: part.name,
				quantity: part.quantity,
				increment: () => {
					part.quantity++;
				},
				decrement: () => {
					part.quantity--;
				},
			});
		}
		return parts;
	}
}
