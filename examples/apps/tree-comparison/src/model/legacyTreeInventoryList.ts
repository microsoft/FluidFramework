/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	BuildNode,
	Change,
	EagerCheckout,
	SharedTree as LegacySharedTree,
	SharedTreeFactory,
	StablePlace,
	StableRange,
	TraitLabel,
	TreeView,
	TreeViewNode,
} from "@fluid-experimental/tree";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedTree } from "@fluidframework/tree/legacy";
import { TypedEmitter } from "tiny-typed-emitter";
import { v4 as uuid } from "uuid";

import type {
	IInventoryItem,
	IInventoryItemEvents,
	IInventoryList,
} from "../modelInterfaces.js";

import {
	InventorySchema,
	NewTreeInventoryList,
	sharedTreeKey,
	treeConfiguration,
} from "./newTreeInventoryList.js";

const legacySharedTreeKey = sharedTreeKey;

/**
 * LegacyTreeInventoryItem is the local object with a friendly interface for the view to use.
 * The LegacyTreeInventoryList can bind these to its inventory items to abstract out how the values are
 * changed.
 */
export class LegacyTreeInventoryItem
	extends TypedEmitter<IInventoryItemEvents>
	implements IInventoryItem
{
	public get id() {
		return this._id;
	}
	public get name() {
		return this._name;
	}
	public get quantity() {
		return this._quantity;
	}
	public set quantity(newQuantity: number) {
		// Setting the quantity does not directly update the value, but rather roundtrips it through
		// the backing data by using the provided callback.  We trust that later this will result in
		// handleQuantityUpdate getting called when the true backing data changes.
		this._setQuantity(newQuantity);
	}
	/**
	 * handleQuantityUpdate is not available on IInventoryItem intentionally, since it should not be
	 * available to the view.  Instead it is to be called by the backing data when the true value
	 * of the data changes.
	 */
	public handleQuantityUpdate(newQuantity: number) {
		this._quantity = newQuantity;
		this.emit("quantityChanged");
	}
	public constructor(
		private readonly _id: string,
		private readonly _name: string,
		private _quantity: number,
		private readonly _setQuantity: (quantity: number) => void,
		public readonly deleteItem: () => void,
	) {
		super();
	}
}

export class LegacyTreeInventoryList extends DataObject implements IInventoryList {
	public isNewTree = false;
	private _tree: LegacySharedTree | undefined;
	private readonly _inventoryItems = new Map<string, LegacyTreeInventoryItem>();

	private get tree() {
		if (this._tree === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._tree;
	}

	public readonly addItem = (name: string, quantity: number) => {
		const addedNode: BuildNode = {
			definition: "inventoryItem",
			traits: {
				id: {
					definition: "id",
					// In a real-world scenario, this is probably a known unique inventory ID (rather than
					// randomly generated).  Randomly generating here just for convenience.
					payload: uuid(),
				},
				name: {
					definition: "name",
					payload: name,
				},
				quantity: {
					definition: "quantity",
					payload: quantity,
				},
			},
		};
		const rootNode = this.tree.currentView.getViewNode(this.tree.currentView.root);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const inventoryNodeId = rootNode.traits.get("inventory" as TraitLabel)![0];
		this.tree.applyEdit(
			Change.insertTree(
				addedNode,
				StablePlace.atEndOf({
					parent: inventoryNodeId,
					label: "inventoryItems" as TraitLabel,
				}),
			),
		);
	};

	public readonly getItems = (): IInventoryItem[] => {
		return [...this._inventoryItems.values()];
	};

	protected async initializingFirstTime(): Promise<void> {
		const legacySharedTree = this.runtime.createChannel(
			undefined,
			LegacySharedTree.getFactory().type,
		) as LegacySharedTree;

		const inventoryNode: BuildNode = {
			definition: "inventory",
			traits: {
				inventoryItems: [
					{
						definition: "inventoryItem",
						traits: {
							id: {
								definition: "id",
								// In a real-world scenario, this is probably a known unique inventory ID (rather than
								// randomly generated).  Randomly generating here just for convenience.
								payload: uuid(),
							},
							name: {
								definition: "name",
								payload: "nut",
							},
							quantity: {
								definition: "quantity",
								payload: 0,
							},
						},
					},
					{
						definition: "inventoryItem",
						traits: {
							id: {
								definition: "id",
								payload: uuid(),
							},
							name: {
								definition: "name",
								payload: "bolt",
							},
							quantity: {
								definition: "quantity",
								payload: 0,
							},
						},
					},
				],
			},
		};
		legacySharedTree.applyEdit(
			Change.insertTree(
				inventoryNode,
				StablePlace.atStartOf({
					parent: legacySharedTree.currentView.root,
					label: "inventory" as TraitLabel,
				}),
			),
		);

		this.root.set(legacySharedTreeKey, legacySharedTree.handle);
	}

	/**
	 * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
	 * DataObject, by registering an event listener for changes to the inventory list.
	 */
	protected async hasInitialized() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._tree = await this.root
			.get<IFluidHandle<LegacySharedTree>>(legacySharedTreeKey)!
			.get();

		// We must use a checkout in order to get "viewChange" events - it doesn't change any of the rest of our usage though.
		const checkout = new EagerCheckout(this._tree);
		// This event handler fires for any change to the tree, so it needs to handle all possibilities (change, add, remove).
		checkout.on("viewChange", (before: TreeView, after: TreeView) => {
			const { changed, added, removed } = before.delta(after);
			for (const quantityNodeId of changed) {
				const quantityNode = this.tree.currentView.getViewNode(quantityNodeId);
				// When adding/removing an inventory item the "inventory" node changes too, but we don't want to handle that here.
				if (quantityNode.definition === "quantity") {
					const newQuantity = quantityNode.payload as number;
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const inventoryItemNodeId = quantityNode.parentage!.parent;
					const inventoryItemNode = this.tree.currentView.getViewNode(inventoryItemNodeId);
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const idNodeId = inventoryItemNode.traits.get("id" as TraitLabel)![0];
					const idNode = this.tree.currentView.getViewNode(idNodeId);
					const inventoryItemId = idNode.payload as string;
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					this._inventoryItems.get(inventoryItemId)!.handleQuantityUpdate(newQuantity);
				}
			}

			for (const inventoryNodeId of added) {
				const inventoryItemNode = this.tree.currentView.getViewNode(inventoryNodeId);
				// Filter to just the inventoryItem nodes.  Each addition will result in four added nodes (inventoryItem, id, name, quantity).
				if (inventoryItemNode.definition === "inventoryItem") {
					const addedInventoryItem = makeInventoryItemFromInventoryItemNode(
						this.tree,
						inventoryItemNode,
					);
					this._inventoryItems.set(addedInventoryItem.id, addedInventoryItem);
					this.emit("itemAdded", addedInventoryItem);
				}
			}

			for (const inventoryNodeId of removed) {
				// Note that in the removal handling we get nodes from "before" rather than currentView, since they're already
				// gone in the current view.
				const inventoryItemNode = before.getViewNode(inventoryNodeId);
				// Filter to just the inventoryItem nodes.  Each deletion will result in four removed nodes (inventoryItem, id, name, quantity).
				if (inventoryItemNode.definition === "inventoryItem") {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const idNodeId = inventoryItemNode.traits.get("id" as TraitLabel)![0];
					const idNode = before.getViewNode(idNodeId);
					const inventoryItemId = idNode.payload as string;
					const deletedInventoryItem = this._inventoryItems.get(inventoryItemId);
					this._inventoryItems.delete(inventoryItemId);
					this.emit("itemDeleted", deletedInventoryItem);
				}
			}
		});

		// Last step of initializing is to populate our map of InventoryItems.
		// Note that this.tree.currentView.root is the ID of the root node, not the root node itself.
		const rootNode = this.tree.currentView.getViewNode(this.tree.currentView.root);
		const inventoryItemsNodeIds = this.tree.currentView
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			.getViewNode(rootNode.traits.get("inventory" as TraitLabel)![0])
			.traits.get("inventoryItems" as TraitLabel);
		// Legacy SharedTree eliminates the "inventoryItems" trait entirely if the list becomes empty, so we need to guard against
		// that case before attempting to iterate over its members.
		if (inventoryItemsNodeIds !== undefined) {
			for (const inventoryItemNodeId of inventoryItemsNodeIds) {
				const inventoryItemNode = this.tree.currentView.getViewNode(inventoryItemNodeId);
				const newInventoryItem = makeInventoryItemFromInventoryItemNode(
					this.tree,
					inventoryItemNode,
				);
				this._inventoryItems.set(newInventoryItem.id, newInventoryItem);
			}
		}
	}
}

// Note that because accessing and modifying the legacy SharedTree depends so much on access to the tree itself
// (in order to have access to tree.currentView.getViewNode and tree.applyEdit) it's more difficult to encapsulate
// an individual inventory item with its corresponding subtree.  Here I prefer to pass callbacks wrapping that
// access to the LegacyTreeInventoryItem rather than hand out access to the whole tree, whereas NewTreeInventoryItem
// can do most of its work with just the item node.
function makeInventoryItemFromInventoryItemNode(
	tree: LegacySharedTree,
	inventoryItemNode: TreeViewNode,
): LegacyTreeInventoryItem {
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const idNodeId = inventoryItemNode.traits.get("id" as TraitLabel)![0];
	const idNode = tree.currentView.getViewNode(idNodeId);
	const id = idNode.payload as string;

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const nameNodeId = inventoryItemNode.traits.get("name" as TraitLabel)![0];
	const nameNode = tree.currentView.getViewNode(nameNodeId);
	const name = nameNode.payload as string;

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const quantityNodeId = inventoryItemNode.traits.get("quantity" as TraitLabel)![0];
	const quantityNode = tree.currentView.getViewNode(quantityNodeId);
	const quantity = quantityNode.payload as number;

	const setQuantity = (newQuantity: number) => {
		tree.applyEdit(Change.setPayload(quantityNodeId, newQuantity));
	};

	const deleteItem = () => {
		tree.applyEdit(Change.delete(StableRange.only(inventoryItemNode.identifier)));
	};

	return new LegacyTreeInventoryItem(id, name, quantity, setQuantity, deleteItem);
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const LegacyTreeInventoryListFactory = new DataObjectFactory<LegacyTreeInventoryList>(
	"legacy-tree-inventory-list",
	LegacyTreeInventoryList,
	[LegacySharedTree.getFactory()],
	{},
);

export const LegacyTreeInventoryListFactoryNew = new DataObjectFactory<NewTreeInventoryList>(
	"legacy-tree-inventory-list",
	NewTreeInventoryList,
	[LegacySharedTree.getFactory(), SharedTree.getFactory()],
	{},
	undefined,
	undefined,
	async (runtime, root) => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const tree = await root
			.get<IFluidHandle<LegacySharedTree>>(legacySharedTreeKey)! // ! it's actually "LegacySharedTree | SharedTree"
			.get();

		// ! Future TODO: If we loaded legacy shared tree factory, we can assume we'll need converter code
		if (tree.attributes.type === SharedTreeFactory.Type) {
			const rootNode = tree.currentView.getViewNode(tree.currentView.root);
			const inventoryItemsNodeIds = tree.currentView
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				.getViewNode(rootNode.traits.get("inventory" as TraitLabel)![0])
				.traits.get("inventoryItems" as TraitLabel);

			const inventoryItems: LegacyTreeInventoryItem[] = [];
			if (inventoryItemsNodeIds !== undefined) {
				for (const inventoryItemNodeId of inventoryItemsNodeIds) {
					const inventoryItemNode = tree.currentView.getViewNode(inventoryItemNodeId);
					inventoryItems.push(makeInventoryItemFromInventoryItemNode(tree, inventoryItemNode));
				}
			}
			const newSharedTree = SharedTree.create(runtime);
			const view = newSharedTree.viewWith(treeConfiguration);
			view.initialize(
				new InventorySchema({
					inventoryItemList: inventoryItems.map((val) => ({
						id: val.id,
						name: val.name,
						quantity: val.quantity,
					})),
				}),
			);
			view.dispose();
			root.set(legacySharedTreeKey, newSharedTree.handle);
		}
	},
);
