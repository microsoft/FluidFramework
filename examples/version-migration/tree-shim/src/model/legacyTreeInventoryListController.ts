/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "@fluid-example/example-utils";
import {
	BuildNode,
	Change,
	EagerCheckout,
	SharedTree as LegacySharedTree,
	StablePlace,
	StableRange,
	TraitLabel,
	TreeView,
	TreeViewNode,
} from "@fluid-experimental/tree";

import { TypedEmitter } from "tiny-typed-emitter";
import { v4 as uuid } from "uuid";

import type { IInventoryItem, IInventoryItemEvents, IInventoryList } from "../modelInterfaces.js";

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

export class LegacyTreeInventoryListController extends EventEmitter implements IInventoryList {
	public static initializeTree(tree: LegacySharedTree): void {
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
		tree.applyEdit(
			Change.insertTree(
				inventoryNode,
				StablePlace.atStartOf({
					parent: tree.currentView.root,
					label: "inventory" as TraitLabel,
				}),
			),
		);
	}

	private readonly _inventoryItems = new Map<string, LegacyTreeInventoryItem>();

	public constructor(private readonly _tree: LegacySharedTree) {
		super();
		// We must use a checkout in order to get "viewChange" events - it doesn't change any of the rest of our usage though.
		const checkout = new EagerCheckout(this._tree);
		// This event handler fires for any change to the tree, so it needs to handle all possibilities (change, add, remove).
		checkout.on("viewChange", (before: TreeView, after: TreeView) => {
			const { changed, added, removed } = before.delta(after);
			for (const quantityNodeId of changed) {
				const quantityNode = this._tree.currentView.getViewNode(quantityNodeId);
				// When adding/removing an inventory item the "inventory" node changes too, but we don't want to handle that here.
				if (quantityNode.definition === "quantity") {
					const newQuantity = quantityNode.payload as number;
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const inventoryItemNodeId = quantityNode.parentage!.parent;
					const inventoryItemNode =
						this._tree.currentView.getViewNode(inventoryItemNodeId);
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const idNodeId = inventoryItemNode.traits.get("id" as TraitLabel)![0];
					const idNode = this._tree.currentView.getViewNode(idNodeId);
					const inventoryItemId = idNode.payload as string;
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					this._inventoryItems.get(inventoryItemId)!.handleQuantityUpdate(newQuantity);
				}
			}

			for (const inventoryNodeId of added) {
				const inventoryItemNode = this._tree.currentView.getViewNode(inventoryNodeId);
				// Filter to just the inventoryItem nodes.  Each addition will result in four added nodes (inventoryItem, id, name, quantity).
				if (inventoryItemNode.definition === "inventoryItem") {
					const addedInventoryItem =
						this.makeInventoryItemFromInventoryItemNode(inventoryItemNode);
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
		// Note that this._tree.currentView.root is the ID of the root node, not the root node itself.
		const rootNode = this._tree.currentView.getViewNode(this._tree.currentView.root);
		const inventoryItemsNodeIds = this._tree.currentView
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			.getViewNode(rootNode.traits.get("inventory" as TraitLabel)![0])
			.traits.get("inventoryItems" as TraitLabel);
		// Legacy SharedTree eliminates the "inventoryItems" trait entirely if the list becomes empty, so we need to guard against
		// that case before attempting to iterate over its members.
		if (inventoryItemsNodeIds !== undefined) {
			for (const inventoryItemNodeId of inventoryItemsNodeIds) {
				const inventoryItemNode = this._tree.currentView.getViewNode(inventoryItemNodeId);
				const newInventoryItem =
					this.makeInventoryItemFromInventoryItemNode(inventoryItemNode);
				this._inventoryItems.set(newInventoryItem.id, newInventoryItem);
			}
		}
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
		const rootNode = this._tree.currentView.getViewNode(this._tree.currentView.root);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const inventoryNodeId = rootNode.traits.get("inventory" as TraitLabel)![0];
		this._tree.applyEdit(
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

	// Note that because accessing and modifying the legacy SharedTree depends so much on access to the tree itself
	// (in order to have access to tree.currentView.getViewNode and tree.applyEdit) it's more difficult to encapsulate
	// an individual inventory item with its corresponding subtree.  Here I prefer to pass callbacks wrapping that
	// access to the LegacyTreeInventoryItem rather than hand out access to the whole tree, whereas NewTreeInventoryItem
	// can do most of its work with just the item node.
	private makeInventoryItemFromInventoryItemNode(
		inventoryItemNode: TreeViewNode,
	): LegacyTreeInventoryItem {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const idNodeId = inventoryItemNode.traits.get("id" as TraitLabel)![0];
		const idNode = this._tree.currentView.getViewNode(idNodeId);
		const id = idNode.payload as string;

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const nameNodeId = inventoryItemNode.traits.get("name" as TraitLabel)![0];
		const nameNode = this._tree.currentView.getViewNode(nameNodeId);
		const name = nameNode.payload as string;

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const quantityNodeId = inventoryItemNode.traits.get("quantity" as TraitLabel)![0];
		const quantityNode = this._tree.currentView.getViewNode(quantityNodeId);
		const quantity = quantityNode.payload as number;

		const setQuantity = (newQuantity: number) => {
			this._tree.applyEdit(Change.setPayload(quantityNodeId, newQuantity));
		};

		const deleteItem = () => {
			this._tree.applyEdit(Change.delete(StableRange.only(inventoryItemNode.identifier)));
		};

		return new LegacyTreeInventoryItem(id, name, quantity, setQuantity, deleteItem);
	}
}
