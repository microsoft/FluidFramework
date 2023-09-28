/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { AllowedUpdateType, ISharedTree, SharedTreeFactory } from "@fluid-experimental/tree2";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { TypedEmitter } from "tiny-typed-emitter";

import { Inventory, schema } from "./schema";

const legacySharedTreeKey = "legacySharedTree";
const sharedTreeKey = "sharedTree";
const sharedTreeForHookKey = "sharedTreeForHook";

const schemaPolicy = {
	schema,
	initialTree: {
		parts: [
			{
				name: "nut",
				quantity: 0,
			},
			{
				name: "bolt",
				quantity: 0,
			},
		],
	},
	allowedSchemaModifications: AllowedUpdateType.None,
};

export interface IPart {
	name: string;
	quantity: number;
	increment: () => void;
	decrement: () => void;
}

export interface IInventoryListEvents {
	inventoryChanged: () => void;
}

export interface IInventoryList extends TypedEmitter<IInventoryListEvents> {
	getParts: () => IPart[];
}

class SharedTreeInventoryList extends TypedEmitter<IInventoryListEvents> implements IInventoryList {
	private readonly _inventory: Inventory;
	// Feels bad to give out the whole ISharedTree.  Should I just pass an ISharedTreeView?
	public constructor(tree: ISharedTree) {
		super();

		const sharedTreeView = tree.schematize(schemaPolicy);
		this._inventory = sharedTreeView.context.root[0] as unknown as Inventory;
		sharedTreeView.events.on("afterBatch", () => {
			this.emit("inventoryChanged");
		});
	}

	public getParts() {
		const parts: IPart[] = [];
		for (const part of this._inventory.parts) {
			parts.push({
				name: part.name,
				quantity: part.quantity,
				increment: () => {
					part.quantity++;
				},
				decrement: () => {
					part.quantity--;
				},
			});
		}
		return parts;
	}
}

export class InventoryListTrio extends DataObject {
	private _legacySharedTree: ISharedTree | undefined;
	private _sharedTreeInventoryList: IInventoryList | undefined;
	private _sharedTreeForHook: ISharedTree | undefined;

	public get legacySharedTree(): ISharedTree {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._legacySharedTree!;
	}

	public get sharedTreeInventoryList() {
		if (this._sharedTreeInventoryList === undefined) {
			throw new Error("Not initialized properly");
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._sharedTreeInventoryList!;
	}

	public get sharedTreeForHook(): ISharedTree {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._sharedTreeForHook!;
	}

	protected async initializingFirstTime() {
		const legacySharedTree = this.runtime.createChannel(
			undefined,
			new SharedTreeFactory().type,
		) as ISharedTree;

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
		this._legacySharedTree = await this.root
			.get<IFluidHandle<ISharedTree>>(legacySharedTreeKey)!
			.get();
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const sharedTree = await this.root.get<IFluidHandle<ISharedTree>>(sharedTreeKey)!.get();
		this._sharedTreeInventoryList = new SharedTreeInventoryList(sharedTree);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._sharedTreeForHook = await this.root
			.get<IFluidHandle<ISharedTree>>(sharedTreeForHookKey)!
			.get();
	}
}

export const InventoryListTrioFactory = new DataObjectFactory(
	"@fluid-experimental/inventory-list",
	InventoryListTrio,
	[new SharedTreeFactory()],
	{},
);
