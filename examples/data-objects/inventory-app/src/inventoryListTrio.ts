/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
	Change,
	ChangeNode,
	Definition,
	SharedTree as LegacySharedTree,
	SharedTreeFactory as LegacySharedTreeFactory,
	StablePlace,
	TraitLabel,
} from "@fluid-experimental/tree";
import { ISharedTree, SharedTreeFactory } from "@fluid-experimental/tree2";
import { IFluidHandle } from "@fluidframework/core-interfaces";

import { IInventoryList } from "./interfaces";
import { SharedTreeInventoryList } from "./sharedTreeInventoryList";
import { LegacySharedTreeInventoryList } from "./legacySharedTreeInventoryList";

const legacySharedTreeKey = "legacySharedTree";
const sharedTreeKey = "sharedTree";
const sharedTreeForHookKey = "sharedTreeForHook";

export class InventoryListTrio extends DataObject {
	private _legacySharedTreeInventoryList: IInventoryList | undefined;
	private _sharedTreeInventoryList: IInventoryList | undefined;
	private _sharedTreeForHook: ISharedTree | undefined;

	public get legacySharedTreeInventoryList() {
		if (this._legacySharedTreeInventoryList === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._legacySharedTreeInventoryList;
	}

	public get sharedTreeInventoryList() {
		if (this._sharedTreeInventoryList === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._sharedTreeInventoryList;
	}

	public get sharedTreeForHook(): ISharedTree {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._sharedTreeForHook!;
	}

	protected async initializingFirstTime() {
		const legacySharedTree = this.runtime.createChannel(
			undefined,
			LegacySharedTree.getFactory().type,
		) as LegacySharedTree;

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

		const sharedTree = this.runtime.createChannel(
			undefined,
			new SharedTreeFactory().type,
		) as ISharedTree;

		const sharedTreeForHook = this.runtime.createChannel(
			undefined,
			new SharedTreeFactory().type,
		) as ISharedTree;

		this.root.set(legacySharedTreeKey, legacySharedTree.handle);
		this.root.set(sharedTreeKey, sharedTree.handle);
		this.root.set(sharedTreeForHookKey, sharedTreeForHook.handle);
	}

	protected async hasInitialized() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const legacySharedTree = await this.root
			.get<IFluidHandle<LegacySharedTree>>(legacySharedTreeKey)!
			.get();
		this._legacySharedTreeInventoryList = new LegacySharedTreeInventoryList(legacySharedTree);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const sharedTree = await this.root.get<IFluidHandle<ISharedTree>>(sharedTreeKey)!.get();
		this._sharedTreeInventoryList = new SharedTreeInventoryList(sharedTree);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._sharedTreeForHook = await this.root
			.get<IFluidHandle<ISharedTree>>(sharedTreeForHookKey)!
			.get();
	}
}

LegacySharedTreeFactory.Type = "foobar";
(LegacySharedTreeFactory.Attributes as any).type = "foobar";

export const InventoryListTrioFactory = new DataObjectFactory(
	"@fluid-experimental/inventory-list",
	InventoryListTrio,
	[LegacySharedTree.getFactory(), new SharedTreeFactory()],
	{},
);
