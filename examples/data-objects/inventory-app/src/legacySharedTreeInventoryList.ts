/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	BuildNode,
	Change,
	SharedTree as LegacySharedTree,
	SharedTreeEvent,
	StablePlace,
	TraitLabel,
} from "@fluid-experimental/tree";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";

import { IInventoryListUntyped, IPart } from "./interfaces";

const legacySharedTreeKey = "legacySharedTree";

/**
 * An inventory list implemented using LegacySharedTree.
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

		const inventoryNode: BuildNode = {
			definition: "inventory",
			traits: {
				parts: [
					{
						definition: "part",
						traits: {
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
						definition: "part",
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

	protected async hasInitialized() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const partsNodeIds = this.tree.currentView
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			.getViewNode(rootNode.traits.get("inventory" as TraitLabel)![0])
			.traits.get("parts" as TraitLabel)!;
		// REV: This seems to iterate in reverse order?  Not sure why it swaps the entries as compared to how
		// it was created.
		for (const partNodeId of partsNodeIds) {
			const partNode = this.tree.currentView.getViewNode(partNodeId);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const nameNodeId = partNode.traits.get("name" as TraitLabel)![0];
			const nameNode = this.tree.currentView.getViewNode(nameNodeId);
			const name = nameNode.payload as string;

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const quantityNodeId = partNode.traits.get("quantity" as TraitLabel)![0];
			const quantityNode = this.tree.currentView.getViewNode(quantityNodeId);
			const quantity = quantityNode.payload as number;

			// REV: It would probably be preferable to have a durable IPart that raises individual
			// "quantityChanged" events rather than eventing/refreshing on a whole-tree basis.  Is
			// there a good way to listen for tree edits under a specific node?  Is the partQuantityNode
			// reference durable across tree changes?
			const part: IPart = {
				name,
				quantity,
				// REV: These implementations are flimsy - they rely on getParts() being called to get
				// fresh parts after each "inventoryChanged" or else the callbacks will be stale.
				// Probably would be better to re-acquire the quantity upon invocation (see question
				// above about what is durable across tree changes).
				increment: () => {
					this.tree.applyEdit(Change.setPayload(quantityNodeId, quantity + 1));
				},
				decrement: () => {
					this.tree.applyEdit(Change.setPayload(quantityNodeId, quantity - 1));
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
