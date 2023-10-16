/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	BuildNode,
	Change,
	EagerCheckout,
	SharedTree as LegacySharedTree,
	NodeId,
	StablePlace,
	StableRange,
	TraitLabel,
	TreeView,
	TreeViewNode,
} from "@fluid-experimental/tree";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";

import type { IInventoryItem, IInventoryList } from "../modelInterfaces";
import { InventoryItem } from "./inventoryItem";

const legacySharedTreeKey = "legacySharedTree";

// TODO: Do I want string here or number?  Prob don't want anything tree-specific
// since this gets exposed to the view.  I've currently removed any reverse lookups so it doesn't
// matter too much.
const nodeIdToInventoryItemId = (nodeId: NodeId) => nodeId.toString();

export class LegacyTreeInventoryList extends DataObject implements IInventoryList {
	private _tree: LegacySharedTree | undefined;
	private readonly _inventoryItems = new Map<string, InventoryItem>();

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
				// REV: If I try to remove these sample items (leaving inventoryItems as an empty array)
				// the trait is removed entirely (undefined).  It seems that empty traits are discarded?
				// This is a problem when later I want to iterate over it (in hasInitialized, when
				// building up my initial set of InventoryItem objects), since I'll get a not-iterable error.
				inventoryItems: [
					{
						definition: "inventoryItem",
						traits: {
							// REV: I tried adding an explicit "ID" trait here and using that for tracking,
							// rather than the NodeId itself.  However, when deleting a node the "removed" member
							// of the "viewChange" event args only includes the NodeId and the nodes are already
							// gone (cannot be retrieved).  So the ID is lost at that point.  I could maintain a
							// separate NodeId -> ID mapping to track, but this feels kind of clunky and defeats
							// the point of getting away from direct usage of NodeIds.
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
				// REV: This is annoying to iterate over since I can't filter until I've retrieved the node object.
				// When adding a node the "inventory" node changes too, but we don't want to handle that here.
				if (quantityNode.definition === "quantity") {
					const newQuantity = quantityNode.payload as number;
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const inventoryItemNodeId = quantityNode.parentage!.parent;
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					this._inventoryItems
						.get(nodeIdToInventoryItemId(inventoryItemNodeId))!
						.handleQuantityUpdate(newQuantity);
				}
			}

			for (const inventoryNodeId of added) {
				const inventoryItemNode = this.tree.currentView.getViewNode(inventoryNodeId);
				// REV: Similar to above, this can't be filtered without grabbing the actual node objects.
				// This list will include the "name" and "quantity" nodes too, but we only want to handle the "inventoryItem".
				if (inventoryItemNode.definition === "inventoryItem") {
					const addedInventoryItem =
						this.makeInventoryItemFromInventoryItemNode(inventoryItemNode);
					this._inventoryItems.set(addedInventoryItem.id, addedInventoryItem);
					this.emit("itemAdded", addedInventoryItem);
				}
			}

			for (const inventoryNodeId of removed) {
				// REV: A twist on the filtering issue, but would be nice to have a way to filter the nodes prior to iterating.
				// This list will include the "name" and "quantity" nodes too, but we only want to handle the "inventoryItem".
				// However, since the nodes were deleted we can't fetch them and filter on definition as for changed/added.
				// Instead we'll just compare the IDs against the inventory items we're tracking (since the name/quantity won't
				// be in there).
				const inventoryItemId = nodeIdToInventoryItemId(inventoryNodeId);
				const deletedInventoryItem = this._inventoryItems.get(inventoryItemId);
				if (deletedInventoryItem !== undefined) {
					this._inventoryItems.delete(inventoryItemId);
					this.emit("itemDeleted", deletedInventoryItem);
				}
			}
		});

		// Last step of initializing is to populate our map of InventoryItems.
		// REV: Seems strange that this.tree.currentView.rootNode is private.
		const rootNode = this.tree.currentView.getViewNode(this.tree.currentView.root);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const inventoryItemsNodeIds = this.tree.currentView
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			.getViewNode(rootNode.traits.get("inventory" as TraitLabel)![0])
			.traits.get("inventoryItems" as TraitLabel)!;
		for (const inventoryItemNodeId of inventoryItemsNodeIds) {
			const inventoryItemNode = this.tree.currentView.getViewNode(inventoryItemNodeId);
			const newInventoryItem = this.makeInventoryItemFromInventoryItemNode(inventoryItemNode);
			this._inventoryItems.set(newInventoryItem.id, newInventoryItem);
		}
	}

	private makeInventoryItemFromInventoryItemNode(inventoryItemNode: TreeViewNode): InventoryItem {
		const id = nodeIdToInventoryItemId(inventoryItemNode.identifier);

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const nameNodeId = inventoryItemNode.traits.get("name" as TraitLabel)![0];
		const nameNode = this.tree.currentView.getViewNode(nameNodeId);
		const name = nameNode.payload as string;

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const quantityNodeId = inventoryItemNode.traits.get("quantity" as TraitLabel)![0];
		const quantityNode = this.tree.currentView.getViewNode(quantityNodeId);
		const quantity = quantityNode.payload as number;

		const setQuantity = (newQuantity: number) => {
			this.tree.applyEdit(Change.setPayload(quantityNodeId, newQuantity));
		};

		const deleteItem = () => {
			this.tree.applyEdit(Change.delete(StableRange.only(inventoryItemNode.identifier)));
		};

		return new InventoryItem(id, name, quantity, setQuantity, deleteItem);
	}
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
