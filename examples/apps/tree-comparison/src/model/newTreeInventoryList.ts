/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AllowedUpdateType,
	ForestType,
	SchemaBuilder,
	typeboxValidator,
	Typed,
	TypedTreeChannel,
	TypedTreeFactory,
} from "@fluid-experimental/tree2";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { TypedEmitter } from "tiny-typed-emitter";
import { v4 as uuid } from "uuid";

import type { IInventoryItem, IInventoryItemEvents, IInventoryList } from "../modelInterfaces";

// To define the tree schema, we'll make a series of calls to a SchemaBuilder to produce schema objects.
// The final schema object will later be used as an argument to the schematize call.  AB#5967
const builder = new SchemaBuilder({ scope: "inventory app" });

const inventoryItemSchema = builder.struct("Contoso:InventoryItem-1.0.0", {
	// Some unique identifier appropriate for the inventory scenario (e.g. a UPC or model number)
	id: builder.string,
	// A user-friendly name
	name: builder.string,
	// The number in stock
	quantity: builder.number,
});
type InventoryItemNode = Typed<typeof inventoryItemSchema>;

// TODO: Convert this to use builder.list() rather than builder.sequence when ready.
const inventorySchema = builder.struct("Contoso:Inventory-1.0.0", {
	inventoryItems: builder.sequence(inventoryItemSchema),
});
type InventoryNode = Typed<typeof inventorySchema>;

// This call finalizes the schema into an object we can pass to schematize.
const schema = builder.toDocumentSchema(inventorySchema);

const newTreeFactory = new TypedTreeFactory({
	jsonValidator: typeboxValidator,
	// REV: I copied this from another example but I have no idea what it means - documentation is
	// self-referencing.
	forest: ForestType.Reference,
	// REV: What's the scenario where I'd want to leverage the subtype?  Documentation makes it sound
	// like it should be optional at least.
	subtype: "InventoryList",
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
		this._inventoryItemNode.boxedQuantity.content = newQuantity;
	}
	public constructor(
		private readonly _inventoryItemNode: InventoryItemNode,
		private readonly _removeItemFromTree: () => void,
	) {
		super();
		// Note that this is not a normal Node EventEmitter and functions differently.  There is no "off" method,
		// but instead "on" returns a callback to unregister the event.  AB#5973
		this._unregisterChangingEvent = this._inventoryItemNode.on("changing", () => {
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
	private _sharedTree: TypedTreeChannel | undefined;
	private get sharedTree(): TypedTreeChannel {
		if (this._sharedTree === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._sharedTree;
	}
	private _inventory: InventoryNode | undefined;
	private get inventory(): InventoryNode {
		if (this._inventory === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._inventory;
	}
	private readonly _inventoryItems = new Map<string, NewTreeInventoryItem>();

	public readonly addItem = (name: string, quantity: number) => {
		this.inventory.inventoryItems.insertAtEnd([
			{
				// In a real-world scenario, this is probably a known unique inventory ID (rather than
				// randomly generated).  Randomly generating here just for convenience.
				id: uuid(),
				name,
				quantity,
			},
		]);
	};

	public readonly getItems = (): IInventoryItem[] => {
		return [...this._inventoryItems.values()];
	};

	protected async initializingFirstTime(): Promise<void> {
		this._sharedTree = this.runtime.createChannel(
			undefined,
			newTreeFactory.type,
		) as TypedTreeChannel;
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
		this._sharedTree = await this.root
			.get<IFluidHandle<TypedTreeChannel>>(sharedTreeKey)!
			.get();
	}

	protected async hasInitialized(): Promise<void> {
		// Note that although we always pass initialTree, it's only actually used on the first load and
		// is ignored on subsequent loads.  AB#5974
		// Note that because we passed a "struct" to the toDocumentSchema() call (rather than a RequiredField),
		// that call will automatically generate and wrap our struct in a RequiredField.  That automatically
		// generated RequiredField is what we get back from the .schematize() call.  So to get back to our
		// struct type we need to get the .content off of the return value of .schematize().
		this._inventory = this.sharedTree.schematize({
			initialTree: {
				inventoryItems: [
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
			},
			allowedSchemaModifications: AllowedUpdateType.None,
			schema,
		}).content;
		// afterChange will fire for any change of any type anywhere in the subtree.  In this application we expect
		// three types of tree changes that will trigger this handler - add items, delete items, change item quantities.
		// Since "afterChange" doesn't provide event args, we need to scan the tree and compare it to our InventoryItems
		// to find what changed.  We'll intentionally ignore the quantity changes here, which are instead handled by
		// "changing" listeners on each individual item node.
		this.inventory.context.on("afterChange", () => {
			for (const inventoryItemNode of this.inventory.inventoryItems) {
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
			const currentInventoryIds = [...this.inventory.inventoryItems].map(
				(inventoryItemNode) => {
					return inventoryItemNode.id;
				},
			);
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
		for (const inventoryItemNode of this.inventory.inventoryItems) {
			const inventoryItem = this.makeInventoryItemFromInventoryItemNode(inventoryItemNode);
			this._inventoryItems.set(inventoryItemNode.id, inventoryItem);
		}
	}

	private makeInventoryItemFromInventoryItemNode(
		inventoryItemNode: InventoryItemNode,
	): NewTreeInventoryItem {
		const removeItemFromTree = () => {
			// REV: Is this the best way to do this?  Was hoping for maybe just an inventoryItemNode.delete().
			// This means I need to either pass in this capability as a callback, or else pass the whole inventory in
			// to provide access to the removeAt call.
			this.inventory.inventoryItems.removeAt(inventoryItemNode.parentField.index);
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
