/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { v4 as uuid } from "uuid";
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
import type { IInventoryItem, IInventoryList } from "../modelInterfaces";
import { transformTreeToJsonableString } from "./appModel";

const treeKey = "sharedTree-key";

class InventoryItem extends EventEmitter implements IInventoryItem {
	public get id() {
		return this._id;
	}
	// Probably would be nice to not hand out the SharedString, but the CollaborativeInput expects it.
	public get name() {
		return this._name;
	}
	public get quantity() {
		const cellValue = this._quantity.get();
		if (cellValue === undefined) {
			throw new Error("Expected a valid quantity");
		}
		return cellValue;
	}
	public set quantity(newValue: number) {
		this._quantity.set(newValue);
	}
	public constructor(
		private readonly _id: string,
		private readonly _name: SharedString,
		private readonly _quantity: SharedCell<number>,
	) {
		super();
		this._quantity.on("valueChanged", () => {
			this.emit("quantityChanged");
		});
	}
}

// type InventoryItemData = { name: IFluidHandle<SharedString>, quantity: IFluidHandle<SharedCell> };

/**
 * The InventoryList is our data object that implements the IInventoryList interface.
 */
export class InventoryList extends DataObject implements IInventoryList {
	private readonly inventoryItems = new Map<string, InventoryItem>();

	public tree: SharedTree | undefined;
	public nodeIds: NodeId[] = [];
	public readonly getTreeView = () => {
		const jsonableTreeString = transformTreeToJsonableString(this.tree as SharedTree);
		return `[${jsonableTreeString.split(',"fields":{}').join("")}]`;
	};
	public readonly addItem = (name: string, quantity: number) => {
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
		const id = uuid();
		this.root.set(id, 1);
	};

	public readonly getItems = () => {
		return [...this.inventoryItems.values()];
	};

	public readonly getItem = (id: string) => {
		return this.inventoryItems.get(id);
	};

	private readonly handleItemAdded = async (id: string) => {
		this.emit("itemAdded");
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
		this.root.on("valueChanged", (changed) => {
			if (changed.previousValue === undefined) {
				// Must be from adding a new item
				this.handleItemAdded(changed.key).catch((error) => {
					console.error(error);
				});
			} else {
				// Since all data modifications happen within the SharedString or SharedCell, the root directory
				// should never see anything except adds and deletes.
				console.error("Unexpected modification to inventory list");
			}
		});
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
