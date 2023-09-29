/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import EventEmitter from "events";
import { TypedEmitter } from "tiny-typed-emitter";

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

export interface IInventoryListUntyped extends EventEmitter {
	getParts: () => IPart[];
	on(event: "inventoryChanged", listener: () => void): this;
}
