/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
	ForestType,
	TreeFactory,
	TreeViewOld,
	typeboxValidator,
	ITree,
} from "@fluid-experimental/tree2";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { Inventory, treeConfiguration } from "./schema";

const treeKey = "tree";

const factory = new TreeFactory({
	jsonValidator: typeboxValidator,
	forest: ForestType.Reference,
});

/**
 * @internal
 */
export class InventoryList extends DataObject {
	#tree?: ITree;
	#view?: TreeViewOld<Inventory>;

	public get inventory(): Inventory {
		if (this.#view === undefined)
			throw new Error("view should be initialized by hasInitialized");
		return this.#view.root;
	}

	protected async initializingFirstTime() {
		this.#tree = this.runtime.createChannel(undefined, factory.type) as ITree;
		this.root.set(treeKey, this.#tree.handle);
	}

	protected async initializingFromExisting() {
		const handle = this.root.get<IFluidHandle<ITree>>(treeKey);
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

/**
 * @internal
 */
export const InventoryListFactory = new DataObjectFactory(
	"@fluid-experimental/inventory-list",
	InventoryList,
	[factory],
	{},
);
