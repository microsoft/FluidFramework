/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Change,
	ChangeNode,
	Definition,
	SharedTree as LegacySharedTree,
	SharedTreeEvent,
	StablePlace,
	TraitLabel,
} from "@fluid-experimental/tree";

import { IInventoryListUntyped, IPart } from "./interfaces";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";

const legacySharedTreeKey = "legacySharedTree";

/**
 * Adapts a given LegacySharedTree into the interface we want to use for an inventory list, IInventoryList.
 */
export class LegacySharedTreeInventoryList extends DataObject implements IInventoryListUntyped {
	private _tree: LegacySharedTree | undefined;
	private get tree() {
		if (this._tree === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._tree;
	}

	protected async initializingFirstTime() {
		const legacySharedTree = this.runtime.createChannel(
			undefined,
			LegacySharedTree.getFactory().type,
		) as LegacySharedTree;

		// Initialize the inventory with two parts at zero quantity
		// REV: Is ChangeNode appropriate here? Or should I use some other type (BuildNode?)?
		const inventoryNode: ChangeNode = {
			identifier: legacySharedTree.generateNodeId(),
			// REV: This is based on the Definition casting from Bubblebench, it doesn't really seem
			// to matter what is used here though.  Is there a better way to omit the definition here?
			definition: "array" as Definition,
			traits: {
				nuts: [
					{
						identifier: legacySharedTree.generateNodeId(),
						definition: "scalar" as Definition,
						traits: {},
						payload: 0,
					},
				],
				bolts: [
					{
						identifier: legacySharedTree.generateNodeId(),
						definition: "scalar" as Definition,
						traits: {},
						payload: 0,
					},
				],
			},
		};
		legacySharedTree.applyEdit(
			Change.insertTree(
				inventoryNode,
				StablePlace.atStartOf({
					parent: legacySharedTree.currentView.root,
					label: "parts" as TraitLabel,
				}),
			),
		);

		this.root.set(legacySharedTreeKey, legacySharedTree.handle);
	}

	protected async hasInitialized() {
		this._tree = await this.root
			.get<IFluidHandle<LegacySharedTree>>(legacySharedTreeKey)!
			.get();

		// REV: I see the tsdoc for EditCommitted recommends using a Checkout instead but that seems
		// like overkill (plus I don't see how it relates exactly).  Is there a better way to just observe
		// that the scalars are changing and raise "inventoryChanged"?
		this._tree.on(SharedTreeEvent.EditCommitted, () => {
			this.emit("inventoryChanged");
		});
	}

	// REV: Lots of casts and non-null assertions below - is there a more type-confident way to do this?
	public getParts() {
		const parts: IPart[] = [];
		// REV: Seems strange that this.tree.currentView.rootNode is private.
		const rootNode = this.tree.currentView.getViewNode(this.tree.currentView.root);
		const partsNode = this.tree.currentView.getViewNode(
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			rootNode.traits.get("parts" as TraitLabel)![0],
		);
		for (const [partLabel, [partQuantityNodeId]] of partsNode.traits) {
			const partQuantityNode = this.tree.currentView.getViewNode(partQuantityNodeId);
			const quantity = partQuantityNode.payload as number;
			// REV: It would probably be preferable to have a durable IPart that raises individual
			// "quantityChanged" events rather than eventing/refreshing on a whole-tree basis.  Is
			// there a good way to listen for tree edits under a specific node?  Is the partQuantityNode
			// reference durable across tree changes?
			const part: IPart = {
				name: partLabel,
				quantity,
				// REV: These implementations are flimsy - they rely on getParts() being called to get
				// fresh parts after each "inventoryChanged" or else the callbacks will be stale.
				// Probably would be better to re-acquire the quantity upon invocation (see question
				// above about what is durable across tree changes).
				increment: () => {
					this.tree.applyEdit(Change.setPayload(partQuantityNodeId, quantity + 1));
				},
				decrement: () => {
					this.tree.applyEdit(Change.setPayload(partQuantityNodeId, quantity - 1));
				},
			};
			parts.push(part);
		}
		return parts;
	}
}

export const legacySharedTreeInventoryListFactory = new DataObjectFactory(
	"legacy-shared-tree-inventory-list",
	LegacySharedTreeInventoryList,
	[LegacySharedTree.getFactory()],
	{},
);
