/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
