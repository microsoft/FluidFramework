/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedTree as LegacySharedTree } from "@fluid-experimental/tree";
import {
	ForestType,
	ISharedTree,
	SharedTreeFactory,
	typeboxValidator,
} from "@fluid-experimental/tree2";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";

import type { IInventoryItem, IInventoryList } from "../modelInterfaces";
import { LegacyTreeInventoryListModel } from "./legacyTreeInventoryListModel";
import { NewTreeInventoryListModel } from "./newTreeInventoryListModel";

const isMigratedKey = "isMigrated";
const legacySharedTreeKey = "legacySharedTree";
const newSharedTreeKey = "newSharedTree";

const newTreeFactory = new SharedTreeFactory({
	jsonValidator: typeboxValidator,
	// For now, ignore the forest argument - I think it's probably going away once the optimized one is ready anyway?  AB#6013
	forest: ForestType.Reference,
});

export class InventoryList extends DataObject implements IInventoryList {
	private _model: IInventoryList | undefined;

	private get model() {
		if (this._model === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._model;
	}

	// TODO Maybe just handle writeOk directly here rather than in the model.
	public get writeOk() {
		return this.model.writeOk;
	}

	public readonly addItem = (name: string, quantity: number) => {
		this.model.addItem(name, quantity);
	};

	public readonly getItems = (): IInventoryItem[] => {
		return this.model.getItems();
	};

	protected async initializingFirstTime(): Promise<void> {
		// TODO: After integrating the shim, this flag and the double tree goes away.  It's just for staging so
		// we can show the demo transitioning between using the legacy ST and new ST
		this.root.set(isMigratedKey, false);

		const legacySharedTree = this.runtime.createChannel(
			undefined,
			LegacySharedTree.getFactory().type,
		) as LegacySharedTree;

		const newSharedTree = this.runtime.createChannel(
			undefined,
			newTreeFactory.type,
		) as ISharedTree;

		// TODO: Here probably should be instantiating the new one instead really.
		LegacyTreeInventoryListModel.initializeTree(legacySharedTree);
		NewTreeInventoryListModel.initializeTree(newSharedTree);

		this.root.set(legacySharedTreeKey, legacySharedTree.handle);
		this.root.set(newSharedTreeKey, newSharedTree.handle);
	}

	/**
	 * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
	 * DataObject, by registering an event listener for changes to the inventory list.
	 */
	protected async hasInitialized() {
		await this.setModel();
	}

	private readonly onItemAdded = (item) => {
		this.emit("itemAdded", item);
	};

	private readonly onItemDeleted = (item) => {
		this.emit("itemDeleted", item);
	};

	private async setModel() {
		// On initial load the _model is unset.  But when migrating we need to unregister listeners from the old model.
		this._model?.off("itemAdded", this.onItemAdded);
		this._model?.off("itemDeleted", this.onItemDeleted);

		// TODO: This whole block becomes something like getting the shim.currentTree, checking which type it is, and
		// instantiating the right model accordingly.
		const isMigrated = this.root.get(isMigratedKey);
		if (!isMigrated) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const tree = await this.root
				.get<IFluidHandle<LegacySharedTree>>(legacySharedTreeKey)!
				.get();
			this._model = new LegacyTreeInventoryListModel(tree);
		} else {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const tree = await this.root.get<IFluidHandle<ISharedTree>>(newSharedTreeKey)!.get();
			this._model = new NewTreeInventoryListModel(tree);
		}

		this._model.on("itemAdded", this.onItemAdded);
		this._model.on("itemDeleted", this.onItemDeleted);
	}

	// This might normally be kicked off by some heuristic or network trigger to decide when to do the migration.
	private async performMigration() {
		// Do nothing if already migrated.
		if (this.root.get(isMigratedKey) === true) {
			return;
		}

		// TODO: This gets replaced with actually calling the migrate API on the shim.
		this.root.set(isMigratedKey, true);
		await this.setModel();
		this.emit("backingDataChanged");
	}

	// For this demo we'll just expose the ability to trigger the migration through DEBUG, this method is sync
	// to make it easy to hook up to a debug button.
	private readonly triggerMigration = () => {
		// Do nothing if already migrated.
		if (this.root.get(isMigratedKey) === true) {
			return;
		}

		this.performMigration()
			.then(() => {
				console.log("Migration complete");
			})
			.catch(console.error);
	};

	public readonly DEBUG = {
		triggerMigration: this.triggerMigration,
		isMigrated: () => this.root.get(isMigratedKey),
	};
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const InventoryListFactory = new DataObjectFactory<InventoryList>(
	"inventory-list",
	InventoryList,
	[LegacySharedTree.getFactory(), newTreeFactory],
	{},
);
