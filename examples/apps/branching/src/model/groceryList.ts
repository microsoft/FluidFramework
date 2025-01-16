/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	type ITree,
	NodeFromSchema,
	SchemaFactory,
	Tree,
	TreeViewConfiguration,
} from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/legacy";
import { TypedEmitter } from "tiny-typed-emitter";
import { v4 as uuid } from "uuid";

import type { IGroceryItem, IGroceryItemEvents, IGroceryList } from "../modelInterfaces.js";

// To define the tree schema, we'll make a series of calls to a SchemaBuilder to produce schema objects.
// The final schema object will later be used as an argument to the schematize call.  AB#5967
const builder = new SchemaFactory("inventory app");

export class InventoryItem extends builder.object("Contoso:InventoryItem-1.0.0", {
	// Some unique identifier appropriate for the inventory scenario (e.g. a UPC or model number)
	id: builder.string,
	// A user-friendly name
	name: builder.string,
	// The number in stock
	quantity: builder.number,
}) {}
const InventoryItemList = builder.array(InventoryItem);
type InventoryItemList = NodeFromSchema<typeof InventoryItemList>;

export class InventorySchema extends builder.object("Contoso:Inventory-1.0.0", {
	inventoryItemList: InventoryItemList,
}) {}

export const treeConfiguration = new TreeViewConfiguration({ schema: InventorySchema });

const sharedTreeKey = "sharedTree";

/**
 * NewTreeInventoryItem is the local object with a friendly interface for the view to use.
 * It wraps a new SharedTree node representing an inventory item to abstract out the tree manipulation and access.
 */
class GroceryItem extends TypedEmitter<IGroceryItemEvents> implements IGroceryItem {
	private readonly _unregisterChangingEvent: () => void;
	public get id() {
		return this._inventoryItemNode.id;
	}
	public get name() {
		return this._inventoryItemNode.name;
	}
	public get quantity() {
		return this._inventoryItemNode.quantity;
	}
	public set quantity(newQuantity: number) {
		// Note that modifying the content here is actually changing the data stored in the SharedTree legitimately
		// (i.e. results in an op sent and changes reflected on all clients).  AB#5970
		this._inventoryItemNode.quantity = newQuantity;
	}
	public constructor(
		private readonly _inventoryItemNode: InventoryItem,
		private readonly _removeItemFromTree: () => void,
	) {
		super();
		// Note that this is not a normal Node EventEmitter and functions differently.  There is no "off" method,
		// but instead "on" returns a callback to unregister the event.  AB#5973
		// Tree.on() is the way to register events on the inventory item (the first argument).  AB#6051
		this._unregisterChangingEvent = Tree.on(this._inventoryItemNode, "nodeChanged", () => {
			this.emit("quantityChanged");
		});
	}
	public readonly deleteItem = () => {
		// TODO: Maybe expose a public dispose() method for disposing the NewTreeInventoryItem without
		// modifying the tree?
		this._unregisterChangingEvent();
		this._removeItemFromTree();
	};
}

export class GroceryList extends DataObject implements IGroceryList {
	private _sharedTree: ITree | undefined;
	private get sharedTree(): ITree {
		if (this._sharedTree === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._sharedTree;
	}
	private _inventoryItemList: InventoryItemList | undefined;
	private get inventoryItemList(): InventoryItemList {
		if (this._inventoryItemList === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._inventoryItemList;
	}
	private readonly _inventoryItems = new Map<string, GroceryItem>();

	public readonly addItem = (name: string, quantity: number) => {
		this.inventoryItemList.insertAtEnd({
			// In a real-world scenario, this is probably a known unique inventory ID (rather than
			// randomly generated).  Randomly generating here just for convenience.
			id: uuid(),
			name,
			quantity,
		});
	};

	public readonly getItems = (): IGroceryItem[] => {
		return [...this._inventoryItems.values()];
	};

	protected async initializingFirstTime(): Promise<void> {
		this._sharedTree = SharedTree.create(this.runtime);
		const view = this._sharedTree.viewWith(treeConfiguration);
		view.initialize(
			new InventorySchema({
				inventoryItemList: [
					{
						id: uuid(),
						name: "nut",
						quantity: 0,
					},
					{
						id: uuid(),
						name: "bolt",
						quantity: 0,
					},
				],
			}),
		);
		view.dispose();
		this.root.set(sharedTreeKey, this._sharedTree.handle);
	}

	protected async hasInitialized(): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._sharedTree = await this.root.get<IFluidHandle<ITree>>(sharedTreeKey)!.get();
		const view = this.sharedTree.viewWith(treeConfiguration);
		this._inventoryItemList = view.root.inventoryItemList;
		// "treeChanged" will fire for any change of any type anywhere in the subtree. In this application we expect
		// three types of tree changes that will trigger this handler - add items, delete items, change item quantities.
		// Since "treeChanged" doesn't provide event args, we need to scan the tree and compare it to our InventoryItems
		// to find what changed.  We'll intentionally ignore the quantity changes here, which are instead handled by
		// "changing" listeners on each individual item node.
		// Tree.on() is the way to register events on the list (the first argument).  AB#6051
		Tree.on(this.inventoryItemList, "treeChanged", () => {
			for (const inventoryItemNode of this.inventoryItemList) {
				// If we're not currently tracking some item in the tree, then it must have been
				// added in this change.
				if (!this._inventoryItems.has(inventoryItemNode.id)) {
					const newInventoryItem =
						this.makeInventoryItemFromInventoryItemNode(inventoryItemNode);
					this._inventoryItems.set(inventoryItemNode.id, newInventoryItem);
					this.emit("itemAdded");
				}
			}

			// Search for deleted inventory items to update our collection
			const currentInventoryIds = this.inventoryItemList.map((inventoryItemNode) => {
				return inventoryItemNode.id;
			});
			for (const trackedItemId of this._inventoryItems.keys()) {
				// If the tree doesn't contain the id of an item we're tracking, then it must have
				// been deleted in this change.
				if (!currentInventoryIds.includes(trackedItemId)) {
					this._inventoryItems.delete(trackedItemId);
					this.emit("itemDeleted");
				}
			}
		});

		// Last step of initializing is to populate our map of InventoryItems.
		for (const inventoryItemNode of this.inventoryItemList) {
			const inventoryItem = this.makeInventoryItemFromInventoryItemNode(inventoryItemNode);
			this._inventoryItems.set(inventoryItemNode.id, inventoryItem);
		}
	}

	private makeInventoryItemFromInventoryItemNode(
		inventoryItemNode: InventoryItem,
	): GroceryItem {
		const removeItemFromTree = () => {
			// We pass in the delete capability as a callback to withold this.inventory access from the
			// inventory items.  AB#6015
			this.inventoryItemList.removeAt(this.inventoryItemList.indexOf(inventoryItemNode));
		};
		const inventoryItem = new GroceryItem(inventoryItemNode, removeItemFromTree);
		return inventoryItem;
	}
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const GroceryListFactory = new DataObjectFactory<GroceryList>(
	"grocery-list",
	GroceryList,
	[SharedTree.getFactory()],
	{},
);
