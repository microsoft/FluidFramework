/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ForestType,
	ISharedTree,
	Tree,
	TreeConfiguration,
	SchemaFactory,
	typeboxValidator,
	TreeFactory,
	NodeFromSchema,
} from "@fluid-experimental/tree2";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { TypedEmitter } from "tiny-typed-emitter";
import { v4 as uuid } from "uuid";

import type { IInventoryItem, IInventoryItemEvents, IInventoryList } from "../modelInterfaces";

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

export const treeConfiguration = new TreeConfiguration(
	InventorySchema,
	() =>
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

const newTreeFactory = new TreeFactory({
	jsonValidator: typeboxValidator,
	// For now, ignore the forest argument - I think it's probably going away once the optimized one is ready anyway?  AB#6013
	forest: ForestType.Reference,
});

const sharedTreeKey = "sharedTree";

/**
 * NewTreeInventoryItem is the local object with a friendly interface for the view to use.
 * It wraps a new SharedTree node representing an inventory item to abstract out the tree manipulation and access.
 */
class NewTreeInventoryItem extends TypedEmitter<IInventoryItemEvents> implements IInventoryItem {
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
		this._unregisterChangingEvent = Tree.on(this._inventoryItemNode, "afterChange", () => {
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

export class NewTreeInventoryList extends DataObject implements IInventoryList {
	private _sharedTree: ISharedTree | undefined;
	private get sharedTree(): ISharedTree {
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
	private readonly _inventoryItems = new Map<string, NewTreeInventoryItem>();

	public readonly addItem = (name: string, quantity: number) => {
		this.inventoryItemList.insertAtEnd({
			// In a real-world scenario, this is probably a known unique inventory ID (rather than
			// randomly generated).  Randomly generating here just for convenience.
			id: uuid(),
			name,
			quantity,
		});
	};

	public readonly getItems = (): IInventoryItem[] => {
		return [...this._inventoryItems.values()];
	};

	protected async initializingFirstTime(): Promise<void> {
		this._sharedTree = this.runtime.createChannel(
			undefined,
			newTreeFactory.type,
		) as ISharedTree;
		this.root.set(sharedTreeKey, this._sharedTree.handle);
		// Convenient repro for bug AB#5975
		// const retrievedSharedTree = await this._sharedTree.handle.get();
		// if (this._sharedTree !== retrievedSharedTree) {
		// 	console.log(this._sharedTree, retrievedSharedTree);
		// 	throw new Error("handle doesn't roundtrip on initial creation");
		// }
	}

	// This would usually live in hasInitialized - I'm using initializingFromExisting here due to bug AB#5975.
	protected async initializingFromExisting(): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._sharedTree = await this.root.get<IFluidHandle<ISharedTree>>(sharedTreeKey)!.get();
	}

	protected async hasInitialized(): Promise<void> {
		// Note that although we always pass initialTree, it's only actually used on the first load and
		// is ignored on subsequent loads.  AB#5974
		// The schematizeView() call does a few things:
		// 1. On first load, stamps the schema we defined above on the tree (permanently).
		// 2. On first load, inserts the initial data we define in the initialTree.
		// 3. On all loads, gets an (untyped) view of the data (the contents can't be accessed directly from the sharedTree).
		// Then the root2() call applies a typing to the untyped view based on our schema.  After that we can actually
		// reach in and grab the inventoryItems list.
		this._inventoryItemList =
			this.sharedTree.schematize(treeConfiguration).root.inventoryItemList;
		// afterChange will fire for any change of any type anywhere in the subtree.  In this application we expect
		// three types of tree changes that will trigger this handler - add items, delete items, change item quantities.
		// Since "afterChange" doesn't provide event args, we need to scan the tree and compare it to our InventoryItems
		// to find what changed.  We'll intentionally ignore the quantity changes here, which are instead handled by
		// "changing" listeners on each individual item node.
		// Tree.on() is the way to register events on the list (the first argument).  AB#6051
		Tree.on(this.inventoryItemList, "afterChange", () => {
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
	): NewTreeInventoryItem {
		const removeItemFromTree = () => {
			// We pass in the delete capability as a callback to withold this.inventory access from the
			// inventory items.  AB#6015
			this.inventoryItemList.removeAt(this.inventoryItemList.indexOf(inventoryItemNode));
		};
		const inventoryItem = new NewTreeInventoryItem(inventoryItemNode, removeItemFromTree);
		return inventoryItem;
	}
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const NewTreeInventoryListFactory = new DataObjectFactory<NewTreeInventoryList>(
	"new-tree-inventory-list",
	NewTreeInventoryList,
	[newTreeFactory],
	{},
);
