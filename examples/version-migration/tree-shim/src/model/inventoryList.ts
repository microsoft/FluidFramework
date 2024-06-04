/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SharedTree as LegacySharedTree,
	MigrationShim,
	MigrationShimFactory,
	SharedTreeShim,
	SharedTreeShimFactory,
} from "@fluid-experimental/tree";
// eslint-disable-next-line import/no-internal-modules
import { EditLog } from "@fluid-experimental/tree/test/EditLog";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ITree } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/internal";

import type { IInventoryItem, IInventoryList, IMigrateBackingData } from "../modelInterfaces.js";

import { LegacyTreeInventoryListController } from "./legacyTreeInventoryListController.js";
import { NewTreeInventoryListController } from "./newTreeInventoryListController.js";

const isMigratedKey = "isMigrated";
const treeKey = "tree";

// Set to true to artificially slow down the migration.
const DEBUG_migrateSlowly = false;

const newTreeFactory = SharedTree.getFactory();

function migrate(legacyTree: LegacySharedTree, newTree: ITree) {
	// Revert local edits - otherwise we will be eventually inconsistent
	const edits = legacyTree.edits as EditLog;
	const localEdits = [...edits.getLocalEdits()].reverse();
	for (const edit of localEdits) {
		legacyTree.revert(edit.id);
	}
	// migrate data
	const legacyTreeData = new LegacyTreeInventoryListController(legacyTree);
	const items = legacyTreeData.getItems();

	const initialTree = {
		inventoryItemList: {
			// TODO: The list type unfortunately needs this "" key for now, but it's supposed to go away soon.
			"": items.map((item) => {
				return {
					id: item.id,
					name: item.name,
					quantity: item.quantity,
				};
			}),
		},
	};
	NewTreeInventoryListController.initializeTree(newTree, initialTree);
}

const legacyTreeFactory = LegacySharedTree.getFactory();
const migrationShimFactory = new MigrationShimFactory(legacyTreeFactory, newTreeFactory, migrate);
const newTreeShimFactory = new SharedTreeShimFactory(newTreeFactory);

export class InventoryList extends DataObject implements IInventoryList, IMigrateBackingData {
	private _model: IInventoryList | undefined;
	private _writeOk: boolean | undefined;
	private _shim: MigrationShim | SharedTreeShim | undefined;

	private get shim() {
		if (this._shim === undefined) {
			throw new Error("Not initialized properly");
		}
		return this._shim;
	}

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
		return this.shim.attributes.type === newTreeShimFactory.type;
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

		const migrationShim = this.runtime.createChannel(
			undefined,
			migrationShimFactory.type,
		) as MigrationShim;
		const legacySharedTree = migrationShim.currentTree as LegacySharedTree;

		LegacyTreeInventoryListController.initializeTree(legacySharedTree);

		this.root.set(treeKey, migrationShim.handle);
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

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._shim = await this.root
			.get<IFluidHandle<MigrationShim | SharedTreeShim>>(treeKey)!
			.get();
		if (this.shim.attributes.type === legacyTreeFactory.type) {
			const tree = this.shim.currentTree as LegacySharedTree;
			this._model = new LegacyTreeInventoryListController(tree);
			const migrationShim = this.shim as MigrationShim;
			migrationShim.on("migrated", () => {
				this.setModel()
					.then(() => {
						this.emit("backingDataChanged");
						this._writeOk = true;
						this.emit("writeOkChanged");
					})
					.catch(console.error);
			});
		} else {
			const tree = this.shim.currentTree as ITree;
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

		const migrationShim = this.shim as MigrationShim;
		migrationShim.submitMigrateOp();
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
	[migrationShimFactory, newTreeShimFactory],
	{},
);
