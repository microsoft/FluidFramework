/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
	AllowedUpdateType,
	ForestType,
	TypedTreeChannel,
	TypedTreeFactory,
	typeboxValidator,
} from "@fluid-experimental/tree2";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { InventoryField, schema } from "./schema";

const treeKey = "tree";

const factory = new TypedTreeFactory({
	jsonValidator: typeboxValidator,
	forest: ForestType.Reference,
	subtype: "InventoryList",
});

export class InventoryList extends DataObject {
	private _tree: TypedTreeChannel | undefined;

	public get tree(): InventoryField {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._tree!.schematize({
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
		});
	}

	protected async initializingFirstTime() {
		this._tree = this.runtime.createChannel(undefined, factory.type) as TypedTreeChannel;
		this.root.set(treeKey, this._tree.handle);
	}

	protected async initializingFromExisting() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._tree = await this.root.get<IFluidHandle<TypedTreeChannel>>(treeKey)!.get();
	}

	protected async hasInitialized() {}
}

export const InventoryListFactory = new DataObjectFactory(
	"@fluid-experimental/inventory-list",
	InventoryList,
	[factory],
	{},
);
