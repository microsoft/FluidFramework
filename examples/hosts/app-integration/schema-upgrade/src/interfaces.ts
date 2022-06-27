/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import type { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { SharedString } from "@fluidframework/sequence";

export interface IContainerKillBitEvents extends IEvent {
    (event: "markedForDestruction" | "dead", listener: () => void);
}

export interface IContainerKillBit extends IEventProvider<IContainerKillBitEvents> {
    dead: boolean;
    setDead(): Promise<void>;
    markedForDestruction: boolean;
    markForDestruction(): Promise<void>;
    volunteerForDestruction(): Promise<void>;
    haveDestructionTask(): boolean;
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
