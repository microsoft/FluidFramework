/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
	ForestType,
	ISharedTree,
	ISharedTreeView2,
	SharedTreeFactory,
	typeboxValidator,
} from "@fluid-experimental/tree2";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { Inventory, treeConfiguration } from "./schema";

const treeKey = "tree";

const factory = new SharedTreeFactory({
	jsonValidator: typeboxValidator,
	forest: ForestType.Reference,
});

export class InventoryList extends DataObject {
	#tree?: ISharedTree;
	#view?: ISharedTreeView2<typeof treeConfiguration.schema.rootFieldSchema>;

	public get inventory(): Inventory {
		if (this.#view === undefined)
			throw new Error("view should be initialized by hasInitialized");
		return this.#view.root;
	}

	protected async initializingFirstTime() {
		this.#tree = this.runtime.createChannel(undefined, factory.type) as ISharedTree;
		this.root.set(treeKey, this.#tree.handle);
	}

	protected async initializingFromExisting() {
		const handle = this.root.get<IFluidHandle<ISharedTree>>(treeKey);
		if (handle === undefined)
			throw new Error("map should be populated on creation by 'initializingFirstTime'");
		this.#tree = await handle.get();
	}

	protected async hasInitialized() {
		if (this.#tree === undefined)
			throw new Error("tree should be initialized by initializing* methods");
		this.#view = this.#tree.schematize(treeConfiguration);
	}
}

export const InventoryListFactory = new DataObjectFactory(
	"@fluid-experimental/inventory-list",
	InventoryList,
	[factory],
	{},
);
