/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventEmitter } from "@fluid-example/example-utils";
import { TypedEmitter } from "tiny-typed-emitter";

/**
 * For demo purposes this is a super-simple interface, but in a real scenario this should have all relevant surface
 * for the application to run.
 */
export interface IInventoryListAppModel {
	/**
	 * An inventory tracker list which may be using either Legacy or New SharedTree.  It is able to migrate its backing data.
	 */
	readonly migratingInventoryList: IInventoryList & IMigrateBackingData;
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
	readonly addItem: (name: string, quantity: number) => void;

	readonly getItems: () => IInventoryItem[];

	/**
	 * The listChanged event will fire whenever an item is added/removed, either locally or remotely.
	 * TODO: Consider using tiny-typed-emitter if not using DataObject
	 */
	on(event: "itemAdded" | "itemDeleted", listener: (item: IInventoryItem) => void): this;
}

export interface IMigrateBackingData extends EventEmitter {
	/**
	 * During initiation of the migration, any further writes will be lost post-migration.
	 * This property (and the corresponding event below) signal that state to discourage writing.
	 * For example, it would be a good idea to disable input fields in the view.
	 * Note: This may map well to existing concepts like readonly mode and not need any distinct flag.
	 * However, it might also be appropriate to only disable writing on the tree-related portion of the
	 * app but permit writing to other DDSs, which is more likely to be a unique concept.
	 */
	readonly writeOk: boolean;

	/**
	 * Fire when the appropriateness of writing changes, view should disable the input fields accordingly.
	 */
	on(event: "writeOkChanged", listener: () => void): this;
	/**
	 * Fires when the backing data (i.e. the SharedTree) has changed, which will necessitate any consumer
	 * to reacquire fresh references to the contents of the list (which will have been re-bound against the
	 * new backing data).
	 */
	on(event: "backingDataChanged", listener: () => void): this;
}
