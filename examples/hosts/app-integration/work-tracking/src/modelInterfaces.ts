/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import type { IEventProvider } from "@fluidframework/common-definitions";
import { SharedString } from "@fluidframework/sequence";
import type { IMigratableModel, IMigratableModelEvents } from "./migrationInterfaces";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IInventoryListAppModelEvents extends IMigratableModelEvents { }

/**
 * For demo purposes this is a super-simple interface, but in a real scenario this should have all relevant surface
 * for the application to run.
 */
export interface IInventoryListAppModel extends IMigratableModel, IEventProvider<IInventoryListAppModelEvents> {
    /**
     * An inventory tracker list.
     */
    readonly inventoryList: IInventoryList;
}

export interface IInventoryItem extends EventEmitter {
    readonly id: string;
    readonly name: SharedString;
    quantity: number;
}

/**
 * IInventoryList describes the public API surface for our inventory list object.
 */
export interface IInventoryList extends EventEmitter {
    readonly addItem: (name: string, quantity: number) => void;

    readonly getItems: () => IInventoryItem[];
    readonly getItem: (id: string) => IInventoryItem | undefined;

    /**
     * The listChanged event will fire whenever an item is added/removed, either locally or remotely.
     */
    on(event: "itemAdded" | "itemDeleted", listener: (item: IInventoryItem) => void): this;
}
