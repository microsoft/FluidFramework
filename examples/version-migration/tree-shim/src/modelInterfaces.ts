/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { TypedEmitter } from "tiny-typed-emitter";

export interface IInventoryListAppModelEvents {
	/**
	 * This event signifies that the prior reference to the inventoryList has become invalid, and that any views
	 * should be rebound to the current inventoryList reference.
	 * TODO: Make sure I want this on the app model, rather than on the inventory list (some thin wrapper to perrmit
	 * retaining the reference across the change)
	 */
	inventoryListChanged: () => void;
}

/**
 * For demo purposes this is a super-simple interface, but in a real scenario this should have all relevant surface
 * for the application to run.
 */
export interface IInventoryListAppModel extends TypedEmitter<IInventoryListAppModelEvents> {
	/**
	 * An inventory tracker list using the legacy shared tree.
	 */
	readonly legacyTreeInventoryList: IInventoryList;
	/**
	 * An inventory tracker list using the new shared tree.
	 */
	readonly newTreeInventoryList: IInventoryList;
	/**
	 * For demo purposes, a debug API to manually trigger the migration.
	 */
	readonly DEBUG_triggerMigration: () => void;
}

export interface IInventoryItemEvents {
	quantityChanged: () => void;
}

export interface IInventoryItem extends TypedEmitter<IInventoryItemEvents> {
	readonly id: string;
	readonly name: string;
	quantity: number;
	readonly deleteItem: () => void;
}

/**
 * IInventoryList describes the public API surface for our inventory list object.
 */
export interface IInventoryList extends EventEmitter {
	/**
	 * During initiation of the migration, any further writes will be lost post-migration.
	 * This property (and the corresponding event below) signal that state to discourage writing.
	 * For example, it would be a good idea to disable input fields in the view.
	 * TODO: This may map well to existing concepts like readonly mode and not need any distinct flag.
	 * However, it might also be appropriate to only disable writing on the tree-related portion of the
	 * app but permit writing to other DDSs, which is more likely to be a unique concept.
	 */
	readonly writeOk: boolean;

	readonly addItem: (name: string, quantity: number) => void;

	readonly getItems: () => IInventoryItem[];

	/**
	 * The listChanged event will fire whenever an item is added/removed, either locally or remotely.
	 * TODO: Consider using tiny-typed-emitter if not using DataObject
	 */
	on(event: "itemAdded" | "itemDeleted", listener: (item: IInventoryItem) => void): this;
	/**
	 * Fire when the appropriateness of writing changes, view should disable the input fields accordingly
	 */
	on(event: "writeOkChanged", listener: () => void): this;
}
