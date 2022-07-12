/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import type { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { SharedString } from "@fluidframework/sequence";

export enum SessionState {
    collaborating,
    migrating,
    ended,
}

export interface IAppEvents extends IEvent {
    (event: "sessionStateChanged", listener: (sessionState: SessionState) => void);
}

export interface IApp extends IEventProvider<IAppEvents> {
    initialize: (initialData?: string) => Promise<void>;
    exportStringData: () => Promise<string>;

    getSessionState(): SessionState;

    acceptedCodeDetails: IFluidCodeDetails;
    proposeCodeDetails: (codeDetails: IFluidCodeDetails) => void;

    newContainerId: string | undefined;
    finalizeMigration: (newContainerId: string) => void;

    inventoryList: IInventoryList;
}

export interface IContainerKillBitEvents extends IEvent {
    (event: "codeDetailsAccepted" | "migrated", listener: () => void);
}

export interface IContainerKillBit extends IEventProvider<IContainerKillBitEvents> {
    migrated: boolean;
    newContainerId: string | undefined;
    setNewContainerId(id: string): Promise<void>;
    codeDetailsProposed: boolean;
    acceptedCodeDetails: IFluidCodeDetails;
    proposeCodeDetails(codeDetails: IFluidCodeDetails): Promise<void>;
    volunteerForMigration(): Promise<void>;
    haveMigrationTask(): boolean;
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
