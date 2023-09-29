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
		// I think it's important to schematize here so the schema gets written before we attach the ST?
		sharedTree.schematize(schemaPolicy);
		this.root.set(sharedTreeKey, sharedTree.handle);
	}

	protected async hasInitialized() {
		const sharedTree = await this.root.get<IFluidHandle<ISharedTree>>(sharedTreeKey)!.get();
		const sharedTreeView = sharedTree.schematize(schemaPolicy);
		this._inventory = sharedTreeView.context.root[0] as unknown as Inventory;
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
