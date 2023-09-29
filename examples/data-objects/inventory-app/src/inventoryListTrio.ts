/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
	SharedTree as LegacySharedTree,
	SharedTreeFactory as LegacySharedTreeFactory,
} from "@fluid-experimental/tree";
import { ISharedTree, SharedTreeFactory } from "@fluid-experimental/tree2";
import { IFluidHandle } from "@fluidframework/core-interfaces";

import { IInventoryList, IInventoryListUntyped } from "./interfaces";
// import { SharedTreeInventoryList } from "./sharedTreeInventoryList";
import { LegacySharedTreeInventoryList } from "./legacySharedTreeInventoryList";
import { sharedTreeInventoryListDOFactory } from "./sharedTreeInventoryListDO";

const legacySharedTreeKey = "legacySharedTree";
const sharedTreeKey = "sharedTree";
const sharedTreeForHookKey = "sharedTreeForHook";

export class InventoryListTrio extends DataObject {
	private _legacySharedTreeInventoryList: IInventoryList | undefined;
	private _sharedTreeInventoryList: IInventoryListUntyped | undefined;
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
		// Would probably be more normal to encapsulate this initialization into the normal lifecycle methods
		// of an individual data object for a single inventory list.
		LegacySharedTreeInventoryList.initializeLegacySharedTreeForInventory(legacySharedTree);

		// const sharedTree = this.runtime.createChannel(
		// 	undefined,
		// 	new SharedTreeFactory().type,
		// ) as ISharedTree;
		const sharedTreeDO = await sharedTreeInventoryListDOFactory.createChildInstance(
			this.context,
		);

		const sharedTreeForHook = this.runtime.createChannel(
			undefined,
			new SharedTreeFactory().type,
		) as ISharedTree;

		this.root.set(legacySharedTreeKey, legacySharedTree.handle);
		this.root.set(sharedTreeKey, sharedTreeDO.handle);
		this.root.set(sharedTreeForHookKey, sharedTreeForHook.handle);
	}

	protected async hasInitialized() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const legacySharedTree = await this.root
			.get<IFluidHandle<LegacySharedTree>>(legacySharedTreeKey)!
			.get();
		this._legacySharedTreeInventoryList = new LegacySharedTreeInventoryList(legacySharedTree);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		// const sharedTree = await this.root.get<IFluidHandle<ISharedTree>>(sharedTreeKey)!.get();
		// this._sharedTreeInventoryList = new SharedTreeInventoryList(sharedTree);
		this._sharedTreeInventoryList = await this.root
			.get<IFluidHandle<IInventoryListUntyped>>(sharedTreeKey)!
			.get();
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._sharedTreeForHook = await this.root
			.get<IFluidHandle<ISharedTree>>(sharedTreeForHookKey)!
			.get();
	}
}

// Hack to allow us to register both LegacySharedTree and new SharedTree at the same time.
// By default they have the same type of "SharedTree" and would collide.
LegacySharedTreeFactory.Type = "LegacySharedTree";
(LegacySharedTreeFactory.Attributes as any).type = "LegacySharedTree";

export const InventoryListTrioFactory = new DataObjectFactory(
	"@fluid-experimental/inventory-list",
	InventoryListTrio,
	[LegacySharedTree.getFactory(), new SharedTreeFactory()],
	{},
	new Map([sharedTreeInventoryListDOFactory.registryEntry]),
);
