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
	 * An inventory tracker list using the legacy shared tree.
	 */
	readonly legacyTreeInventoryList: IInventoryList;
	/**
	 * An inventory tracker list using the new shared tree.
	 */
	// readonly newTreeInventoryList: IInventoryList;
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

	readonly isNewTree: boolean;
}
