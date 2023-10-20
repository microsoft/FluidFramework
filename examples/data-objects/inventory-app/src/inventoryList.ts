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

	public get inventory(): Inventory {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._view!.root2(schema);
	}

	protected async initializingFirstTime() {
		this._tree = this.runtime.createChannel(undefined, factory.type) as ISharedTree;
		this.root.set(treeKey, this._tree.handle);
	}

	protected async initializingFromExisting() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- map populated on creation by 'initializingFirstTime'.
		this._tree = await this.root.get<IFluidHandle<ISharedTree>>(treeKey)!.get();
	}

	protected async hasInitialized() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- field initialized by initializing* methods.
		this._view = this._tree!.schematizeView({
			initialTree: {
				// TODO: FieldNodes should not require wrapper object
				parts: {
					"": [
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
			},
			allowedSchemaModifications: AllowedUpdateType.None,
			schema,
		});
	}
}

export const InventoryListFactory = new DataObjectFactory(
	"@fluid-experimental/inventory-list",
	InventoryList,
	[factory],
	{},
);
