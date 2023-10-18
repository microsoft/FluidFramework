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

// REV: Building this up as a series of builder invocations makes it hard to read the schema.
// Would be nice if instead we could define some single big Serializable or similar that laid the
// schema out and then pass that in.
// TODO: Convert this to use builder.list() rather than builder.sequence when ready.
const inventorySchema = builder.struct("Contoso:Inventory-1.0.0", {
	inventoryItems: builder.sequence(inventoryItemSchema),
});
type InventoryNode = Typed<typeof inventorySchema>;

// REV: The root inventoryFieldSchema feels extra to me.  Is there a way to omit it?  Something like
// builder.toDocumentSchema(inventorySchema)
const inventoryFieldSchema = SchemaBuilder.required(inventorySchema);
type InventoryField = Typed<typeof inventoryFieldSchema>;

const schema = builder.toDocumentSchema(inventoryFieldSchema);

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
		// REV: This still seems surprising to me that it's making the remote change, I think
		// it would be more apparent as .setContent() rather than using the setter.
		this._inventoryItemNode.boxedQuantity.content = newQuantity;
	}
	public constructor(
		private readonly _inventoryItemNode: InventoryItemNode,
		private readonly _removeItemFromTree: () => void,
	) {
		super();
		// REV: I personally find the deviation from standard EventEmitter API
		// surprising/unintuitive/inconvenient, in particular here as it requires storing a reference
		// to the unregister callback.
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
	private _inventory: InventoryField | undefined;
	private get inventory(): InventoryNode {
		if (this._inventory === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._inventory.content;
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
	}

	// REV: Have to use initializingFromExisting here rather than hasInitialized due to a bug - getting
	// the handle on the creating client retrieves the wrong object.
	protected async initializingFromExisting(): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._sharedTree = await this.root
			.get<IFluidHandle<TypedTreeChannel>>(sharedTreeKey)!
			.get();
	}

	protected async hasInitialized(): Promise<void> {
		// REV: I don't particularly like the combined schematize/initialize.  My preference would be for
		// separate schematize/initialize calls.
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
		});
		// REV: This event feels overly-broad for what I'm looking for, but I'm having issues with
		// more node-specific events ("changing", etc.).
		this.inventory.context.on("afterChange", () => {
			// Since "afterChange" doesn't provide event args, we need to scan the tree and compare
			// it to our InventoryItems to find what changed.  This event handler fires for any
			// change to the tree, so it needs to handle all possibilities (change, add, remove).
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
