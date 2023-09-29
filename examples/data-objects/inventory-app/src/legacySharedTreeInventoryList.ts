/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Change,
	SharedTree as LegacySharedTree,
	SharedTreeEvent,
	TraitLabel,
} from "@fluid-experimental/tree";
import { TypedEmitter } from "tiny-typed-emitter";

import { IInventoryList, IInventoryListEvents, IPart } from "./interfaces";

/**
 * Adapts a given LegacySharedTree into the interface we want to use for an inventory list, IInventoyrList.
 */
export class LegacySharedTreeInventoryList
	extends TypedEmitter<IInventoryListEvents>
	implements IInventoryList
{
	// private readonly _inventory: Inventory;
	// Feels bad to give out the whole LegacySharedTree.  Is there something more scoped to pass (root or something)?
	public constructor(private readonly tree: LegacySharedTree) {
		super();

		tree.on(SharedTreeEvent.EditCommitted, () => {
			this.emit("inventoryChanged");
		});
	}

	public getParts() {
		const parts: IPart[] = [];
		const rootNode = this.tree.currentView.getViewNode(this.tree.currentView.root);
		const partsNode = this.tree.currentView.getViewNode(
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
