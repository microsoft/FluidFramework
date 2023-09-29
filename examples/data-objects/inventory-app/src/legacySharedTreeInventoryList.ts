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
			throw new Error("Not properly initialized");
		}
		return this._tree;
	}

	// This is kind of playing the role of "schematize" from new SharedTree.
	// The tree it sets up here matches what it expects to see in getParts().
	// If LegacySharedTreeInventoryList were a full DataObject, maybe this would just live in
	// initializingFirstTime().
	public static initializeLegacySharedTreeForInventory(tree: LegacySharedTree) {
		const rootNode = tree.currentView.getViewNode(tree.currentView.root);
		if (rootNode.traits.size !== 0) {
			throw new Error("This tree is already initialized!");
		}

		const inventoryNode: ChangeNode = {
			identifier: tree.generateNodeId(),
			definition: "array" as Definition,
			traits: {
				nuts: [
					{
						identifier: tree.generateNodeId(),
						definition: "scalar" as Definition,
						traits: {},
						payload: 0,
					},
				],
				bolts: [
					{
						identifier: tree.generateNodeId(),
						definition: "scalar" as Definition,
						traits: {},
						payload: 0,
					},
				],
			},
		};
		tree.applyEdit(
			Change.insertTree(
				inventoryNode,
				StablePlace.atStartOf({
					parent: tree.currentView.root,
					label: "parts" as TraitLabel,
				}),
			),
		);
	}

	protected async initializingFirstTime() {
		const legacySharedTree = this.runtime.createChannel(
			undefined,
			LegacySharedTree.getFactory().type,
		) as LegacySharedTree;

		const rootNode = legacySharedTree.currentView.getViewNode(
			legacySharedTree.currentView.root,
		);
		if (rootNode.traits.size !== 0) {
			throw new Error("This tree is already initialized!");
		}

		const inventoryNode: ChangeNode = {
			identifier: legacySharedTree.generateNodeId(),
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

		this._tree.on(SharedTreeEvent.EditCommitted, () => {
			this.emit("inventoryChanged");
		});
	}

	public getParts() {
		const parts: IPart[] = [];
		const rootNode = this.tree.currentView.getViewNode(this.tree.currentView.root);
		const partsNode = this.tree.currentView.getViewNode(
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			rootNode.traits.get("parts" as TraitLabel)![0],
		);
		for (const [partLabel, [partQuantityNodeId]] of partsNode.traits) {
			const partQuantityNode = this.tree.currentView.getViewNode(partQuantityNodeId);
			const quantity = partQuantityNode.payload as number;
			const part: IPart = {
				name: partLabel,
				quantity,
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
