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

import type { IInventoryItem, IInventoryList, IMigrateBackingData } from "../modelInterfaces";
import { LegacyTreeInventoryListController } from "./legacyTreeInventoryListController";
import { NewTreeInventoryListController } from "./newTreeInventoryListController";

const isMigratedKey = "isMigrated";
const legacySharedTreeKey = "legacySharedTree";
const newSharedTreeKey = "newSharedTree";

// Set to true to artificially slow down the migration.
const DEBUG_migrateSlowly = false;

const newTreeFactory = new SharedTreeFactory({
	jsonValidator: typeboxValidator,
	// For now, ignore the forest argument - I think it's probably going away once the optimized one is ready anyway?  AB#6013
	forest: ForestType.Reference,
});

export class InventoryList extends DataObject implements IInventoryList, IMigrateBackingData {
	private _model: IInventoryList | undefined;
	private _writeOk: boolean | undefined;

	private get model() {
		if (this._model === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._model;
	}

	public get writeOk() {
		if (this._writeOk === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._writeOk;
	}

	private readonly isMigrated = () => {
		const isMigrated = this.root.get<boolean>(isMigratedKey);
		if (isMigrated === undefined) {
			throw new Error("Not initialized properly");
		}
		return isMigrated;
	};

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

		// TODO: I call these initializeTree methods here because otherwise the trees may not be initialized before
		// attaching (in particular the New SharedTree, which in this demo doesn't actually get used until the migration
		// occurs.  After switching to the shim, these might be able to be simplified.
		LegacyTreeInventoryListController.initializeTree(legacySharedTree);
		NewTreeInventoryListController.initializeTree(newSharedTree);

		this.root.set(legacySharedTreeKey, legacySharedTree.handle);
		this.root.set(newSharedTreeKey, newSharedTree.handle);
	}

	/**
	 * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
	 * DataObject, by registering an event listener for changes to the inventory list.
	 */
	protected async hasInitialized() {
		await this.setModel();
		// TODO: Inspect migration state and set writeOk appropriately, we may be mid-migration when loading.
		this._writeOk = true;
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
		if (!this.isMigrated()) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const tree = await this.root
				.get<IFluidHandle<LegacySharedTree>>(legacySharedTreeKey)!
				.get();
			this._model = new LegacyTreeInventoryListController(tree);
		} else {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const tree = await this.root.get<IFluidHandle<ISharedTree>>(newSharedTreeKey)!.get();
			this._model = new NewTreeInventoryListController(tree);
		}

		this._model.on("itemAdded", this.onItemAdded);
		this._model.on("itemDeleted", this.onItemDeleted);
	}

	// This might normally be kicked off by some heuristic or network trigger to decide when to do the migration.
	private async performMigration() {
		// Do nothing if already migrated.
		if (this.isMigrated()) {
			return;
		}

		// TODO: writeOk is actually driven by shim state/events and shouldn't be located in performMigration.
		this._writeOk = false;
		this.emit("writeOkChanged");

		// Debug option to make it easier to observe the state changes.
		if (DEBUG_migrateSlowly) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		// TODO: This flag set gets replaced with actually calling the migrate API on the shim.
		this.root.set(isMigratedKey, true);
		await this.setModel();
		this.emit("backingDataChanged");

		this._writeOk = true;
		this.emit("writeOkChanged");
	}

	// For this demo we'll just expose the ability to trigger the migration through DEBUG, this method is sync
	// to make it easy to hook up to a debug button.
	private readonly triggerMigration = () => {
		// Do nothing if already migrated.
		if (this.isMigrated()) {
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
		isMigrated: this.isMigrated,
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
