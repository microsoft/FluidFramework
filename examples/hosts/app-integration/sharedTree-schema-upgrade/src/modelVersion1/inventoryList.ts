/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import { SharedString } from "@fluidframework/sequence";
import {
	BuildNode,
	Change,
	NodeId,
	SharedTree,
	StablePlace,
	TraitLabel,
} from "@fluid-experimental/tree";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IInventoryList } from "../modelInterfaces";
import { transformTreeToJsonableString } from "./appModel";

const treeKey = "sharedTree-key";

/**
 * The InventoryList is our data object that implements the IInventoryList interface.
 */
export class InventoryList extends DataObject implements IInventoryList {
	// private readonly inventoryItems = new Map<string, InventoryItem>();
	public tree: SharedTree | undefined;
	public nodeIds: NodeId[] = [];
	public readonly getTreeView = () => {
		const jsonableTreeString = transformTreeToJsonableString(this.tree as SharedTree);
		return jsonableTreeString;
	};
	public readonly addItem = (name: string, quantity: number) => {
		// inserts using experimental sharedTree
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const nodeId = this.tree!.generateNodeId();
		const node: BuildNode = {
			definition: "Node",
			identifier: nodeId,
		};
		const randomParentId = this.nodeIds[Math.floor(Math.random() * this.nodeIds.length)];
		this.tree?.applyEdit(
			Change.insertTree(
				node,
				StablePlace.atStartOf({
					parent: randomParentId,
					label: "foo" as TraitLabel,
				}),
			),
		);
		this.nodeIds.push(nodeId);
	};

	public readonly deleteItem = (id: string) => {
		this.root.delete(id);
	};

	/**
	 * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
	 * DataObject, by registering an event listener for changes to the inventory list.
	 */
	protected async hasInitialized() {
		const treeHandle = this.root.get<IFluidHandle<SharedTree>>(treeKey);
		if (treeHandle === undefined) {
			throw new Error("SharedTree missing");
		}
		this.tree = await treeHandle.get();
		this.nodeIds.push(this.tree.currentView.root);
	}

	protected async initializingFirstTime() {
		const tree = SharedTree.create(this.runtime);
		this.root.set(treeKey, tree.handle);
	}
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const InventoryListInstantiationFactory = new DataObjectFactory<InventoryList>(
	"inventory-list",
	InventoryList,
	[SharedCell.getFactory(), SharedString.getFactory(), SharedTree.getFactory()],
	{},
);
