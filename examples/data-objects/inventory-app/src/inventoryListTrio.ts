/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { ISharedTree, SharedTreeFactory } from "@fluid-experimental/tree2";
import { IFluidHandle } from "@fluidframework/core-interfaces";

import { IInventoryListUntyped } from "./interfaces";
import { sharedTreeInventoryListFactory } from "./sharedTreeInventoryList";
import { legacySharedTreeInventoryListFactory } from "./legacySharedTreeInventoryList";

const legacySharedTreeInventoryListKey = "legacySharedTreeInventoryList";
const sharedTreeInventoryListKey = "sharedTreeInventoryList";
const sharedTreeForHookKey = "sharedTreeForHook";

export class InventoryListTrio extends DataObject {
	private _legacySharedTreeInventoryList: IInventoryListUntyped | undefined;
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
		const legacySharedTreeInventoryList =
			await legacySharedTreeInventoryListFactory.createChildInstance(this.context);
		const sharedTreeInventoryList = await sharedTreeInventoryListFactory.createChildInstance(
			this.context,
		);

		const sharedTreeForHook = this.runtime.createChannel(
			undefined,
			new SharedTreeFactory().type,
		) as ISharedTree;

		this.root.set(legacySharedTreeInventoryListKey, legacySharedTreeInventoryList.handle);
		this.root.set(sharedTreeInventoryListKey, sharedTreeInventoryList.handle);
		this.root.set(sharedTreeForHookKey, sharedTreeForHook.handle);
	}

	protected async hasInitialized() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._legacySharedTreeInventoryList = await this.root
			.get<IFluidHandle<IInventoryListUntyped>>(legacySharedTreeInventoryListKey)!
			.get();
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._sharedTreeInventoryList = await this.root
			.get<IFluidHandle<IInventoryListUntyped>>(sharedTreeInventoryListKey)!
			.get();
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._sharedTreeForHook = await this.root
			.get<IFluidHandle<ISharedTree>>(sharedTreeForHookKey)!
			.get();
	}
}

// REV: One interesting challenge is that SharedTree and LegacySharedTree have the same Type ("SharedTree")
// This means we can't register both under the same DataObjectFactory since they'll collide.  I dodge
// that constraint here by burying them in individual DataObjectFactories but it's a little annoying.
export const InventoryListTrioFactory = new DataObjectFactory(
	"@fluid-experimental/inventory-list",
	InventoryListTrio,
	[new SharedTreeFactory()],
	{},
	new Map([
		legacySharedTreeInventoryListFactory.registryEntry,
		sharedTreeInventoryListFactory.registryEntry,
	]),
);
