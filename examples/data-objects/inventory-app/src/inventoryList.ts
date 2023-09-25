/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { ISharedTree, SharedTreeFactory } from "@fluid-experimental/tree2";
import { IFluidHandle } from "@fluidframework/core-interfaces";

const legacySharedTreeKey = "legacySharedTree";
const sharedTreeKey = "sharedTree";
const sharedTreeForHookKey = "sharedTreeForHook";

export class InventoryList extends DataObject {
	private _legacySharedTree: ISharedTree | undefined;
	private _sharedTree: ISharedTree | undefined;
	private _sharedTreeForHook: ISharedTree | undefined;

	public get legacySharedTree(): ISharedTree {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._legacySharedTree!;
	}

	public get sharedTree(): ISharedTree {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._sharedTree!;
	}

	public get sharedTreeForHook(): ISharedTree {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._sharedTreeForHook!;
	}

	protected async initializingFirstTime() {
		this._legacySharedTree = this.runtime.createChannel(
			undefined,
			new SharedTreeFactory().type,
		) as ISharedTree;

		this._sharedTree = this.runtime.createChannel(
			undefined,
			new SharedTreeFactory().type,
		) as ISharedTree;

		this._sharedTreeForHook = this.runtime.createChannel(
			undefined,
			new SharedTreeFactory().type,
		) as ISharedTree;

		this.root.set(legacySharedTreeKey, this.legacySharedTree.handle);
		this.root.set(sharedTreeKey, this.sharedTree.handle);
		this.root.set(sharedTreeForHookKey, this.sharedTreeForHook.handle);
	}

	protected async initializingFromExisting() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._legacySharedTree = await this.root
			.get<IFluidHandle<ISharedTree>>(legacySharedTreeKey)!
			.get();
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._sharedTree = await this.root.get<IFluidHandle<ISharedTree>>(sharedTreeKey)!.get();
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._sharedTreeForHook = await this.root
			.get<IFluidHandle<ISharedTree>>(sharedTreeForHookKey)!
			.get();
	}

	protected async hasInitialized() {}
}

export const InventoryListFactory = new DataObjectFactory(
	"@fluid-experimental/inventory-list",
	InventoryList,
	[new SharedTreeFactory()],
	{},
);
