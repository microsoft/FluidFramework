/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import EventEmitter from "events";
import { TypedEmitter } from "tiny-typed-emitter";

// Would be cool to have a quantityChanged event on this interface.
export interface IPart {
	name: string;
	quantity: number;
	increment: () => void;
	decrement: () => void;
}

export interface IInventoryListEvents {
	inventoryChanged: () => void;
}

// This interface is preferable but DataObject is annoying to used with typed events...
export interface IInventoryList extends TypedEmitter<IInventoryListEvents> {
	getParts: () => IPart[];
}

// ...So this interface is the lazy way to put events on a DataObject.
export interface IInventoryListUntyped extends EventEmitter {
	getParts: () => IPart[];
	on(event: "inventoryChanged", listener: () => void): this;
}
