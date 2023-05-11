/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { ISharedTree, SharedTreeFactory } from "@fluid-experimental/tree2";
import { IFluidHandle } from "@fluidframework/core-interfaces";

const treeKey = "tree";

export class InventoryList extends DataObject {
	private _tree: ISharedTree | undefined;

	public get tree(): ISharedTree {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._tree!;
	}

	protected async initializingFirstTime() {
		this._tree = this.runtime.createChannel(
			undefined,
			new SharedTreeFactory().type,
		) as ISharedTree;

		this.root.set(treeKey, this.tree.handle);
	}

	protected async initializingFromExisting() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._tree = await this.root.get<IFluidHandle<ISharedTree>>(treeKey)!.get();
	}

	protected async hasInitialized() {}
}

export const InventoryListFactory = new DataObjectFactory(
	"@fluid-experimental/inventory-list",
	InventoryList,
	[new SharedTreeFactory()],
	{},
);
