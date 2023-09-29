/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AllowedUpdateType, ISharedTree, SharedTreeFactory } from "@fluid-experimental/tree2";

import { IInventoryListUntyped, IPart } from "./interfaces";
import { Inventory, schema } from "./schema";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";

const sharedTreeKey = "sharedTree";

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
export class SharedTreeInventoryList extends DataObject implements IInventoryListUntyped {
	private _inventory: Inventory | undefined;
	private get inventory() {
		if (this._inventory === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._inventory;
	}

	protected async initializingFirstTime() {
		const sharedTree = this.runtime.createChannel(
			undefined,
			new SharedTreeFactory().type,
		) as ISharedTree;
		// REV: I think it's a good practice to schematize here so the schema gets written before we attach the ST?
		// AFAICT there's no negative impact from calling schematize a second time in hasInitialized and this way
		// the initial attach snapshot has the right schema too.
		sharedTree.schematize(schemaPolicy);
		this.root.set(sharedTreeKey, sharedTree.handle);
	}

	protected async hasInitialized() {
		const sharedTree = await this.root.get<IFluidHandle<ISharedTree>>(sharedTreeKey)!.get();
		const sharedTreeView = sharedTree.schematize(schemaPolicy);
		this._inventory = sharedTreeView.context.root[0] as unknown as Inventory;
		// REV: Similar to comment on LegacySharedTree, this event feels overly-broad for what I'm looking for.
		// Also I personally find the deviation from standard EventEmitter here unintuitive and inconvenient.
		sharedTreeView.events.on("afterBatch", () => {
			this.emit("inventoryChanged");
		});
	}

	public getParts() {
		const parts: IPart[] = [];
		for (const part of this.inventory.parts) {
			parts.push({
				name: part.name,
				quantity: part.quantity,
				increment: () => {
					// REV: Copied from the HookView - this is clever but surprising/unintuitive that it works IMO.
					// It doesn't hint that this is actually making an edit that will result in an op, but instead
					// looks like it's just modifying a local value.  As opposed to something like e.g.
					// part.quantity.set(part.quantity.value + 1)
					// Consider that a similar approach would be wrong for other DDSs e.g.
					// someSharedMap.get("quantity")++
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

export const sharedTreeInventoryListFactory = new DataObjectFactory(
	"shared-tree-inventory-list",
	SharedTreeInventoryList,
	[new SharedTreeFactory()],
	{},
);
