/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
	AllowedUpdateType,
	ForestType,
	ISharedTree,
	ISharedTreeView,
	SharedTreeFactory,
	typeboxValidator,
} from "@fluid-experimental/tree2";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { Inventory, schema } from "./schema";

const treeKey = "tree";

const factory = new SharedTreeFactory({
	jsonValidator: typeboxValidator,
	forest: ForestType.Reference,
});

export class InventoryList extends DataObject {
	private _tree?: ISharedTree;
	private _view?: ISharedTreeView;

	private get tree(): ISharedTree {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._tree!;
	}

	public get view(): ISharedTreeView {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._view!;
	}

	public get inventory(): Inventory {
		return this.view.root2(schema) as unknown as Inventory;
	}

	protected async initializingFirstTime() {
		this._tree = this.runtime.createChannel(undefined, factory.type) as ISharedTree;
		this.root.set(treeKey, this._tree.handle);
	}

	protected async initializingFromExisting() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._tree = await this.root.get<IFluidHandle<ISharedTree>>(treeKey)!.get();
	}

	protected async hasInitialized() {
		this._view = this.tree.schematize({
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
			schema,
		} as any);
	}
}

export const InventoryListFactory = new DataObjectFactory(
	"@fluid-experimental/inventory-list",
	InventoryList,
	[factory],
	{},
);
