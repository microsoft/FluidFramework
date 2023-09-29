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
export class SharedTreeInventoryListDO extends DataObject implements IInventoryListUntyped {
	private _inventory: Inventory | undefined;
	private get inventory() {
		if (this._inventory === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._inventory;
	}

	/**
	 * initializingFirstTime is run only once by the first client to create the DataObject.  Here we use it to
	 * initialize the state of the DataObject.
	 */
	protected async initializingFirstTime() {
		const sharedTree = this.runtime.createChannel(
			undefined,
			new SharedTreeFactory().type,
		) as ISharedTree;
		this.root.set(sharedTreeKey, sharedTree.handle);
	}

	/**
	 * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
	 * DataObject, by registering an event listener for dice rolls.
	 */
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

export const sharedTreeInventoryListDOFactory = new DataObjectFactory(
	"shared-tree-inventory-list",
	SharedTreeInventoryListDO,
	[new SharedTreeFactory()],
	{},
);
