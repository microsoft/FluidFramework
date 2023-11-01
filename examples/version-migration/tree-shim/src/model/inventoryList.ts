/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedTree as LegacySharedTree } from "@fluid-experimental/tree";
import { ForestType, SharedTreeFactory, typeboxValidator } from "@fluid-experimental/tree2";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";

import type { IInventoryItem, IInventoryList } from "../modelInterfaces";
import { LegacyTreeInventoryListModel } from "./legacyTreeInventoryListModel";

const sharedTreeKey = "sharedTree";

const newTreeFactory = new SharedTreeFactory({
	jsonValidator: typeboxValidator,
	// For now, ignore the forest argument - I think it's probably going away once the optimized one is ready anyway?  AB#6013
	forest: ForestType.Reference,
});

export class InventoryList extends DataObject implements IInventoryList {
	private _model: IInventoryList | undefined;

	private get model() {
		if (this._model === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._model;
	}

	// TODO Maybe just handle writeOk directly here rather than in the model.
	public get writeOk() {
		return this.model.writeOk;
	}

	public readonly addItem = (name: string, quantity: number) => {
		this.model.addItem(name, quantity);
	};

	public readonly getItems = (): IInventoryItem[] => {
		return this.model.getItems();
	};

	protected async initializingFirstTime(): Promise<void> {
		const legacySharedTree = this.runtime.createChannel(
			undefined,
			LegacySharedTree.getFactory().type,
		) as LegacySharedTree;

		// TODO: Here probably should be instantiating the new one instead really.
		LegacyTreeInventoryListModel.initializeTree(legacySharedTree);

		this.root.set(sharedTreeKey, legacySharedTree.handle);
	}

	/**
	 * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
	 * DataObject, by registering an event listener for changes to the inventory list.
	 */
	protected async hasInitialized() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const tree = await this.root.get<IFluidHandle<LegacySharedTree>>(sharedTreeKey)!.get();
		// TODO: Here detect whether we really got a legacy or new tree back and instantiate the right model
		this._model = new LegacyTreeInventoryListModel(tree);
		// TODO: These need to be swapped when the model swaps
		this._model.on("itemAdded", (item) => {
			this.emit("itemAdded", item);
		});
		this._model.on("itemDeleted", (item) => {
			this.emit("itemDeleted", item);
		});
	}
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const InventoryListFactory = new DataObjectFactory<InventoryList>(
	"inventory-list",
	InventoryList,
	[LegacySharedTree.getFactory(), newTreeFactory],
	{},
);
