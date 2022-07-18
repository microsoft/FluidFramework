/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import type { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { SharedString } from "@fluidframework/sequence";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IBootLoaderEvents extends IEvent {
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IBootLoader extends IEventProvider<IBootLoaderEvents> {
}

export enum MigrationState {
    collaborating,
    migrating,
    ended,
}

export interface IMigrationEvents extends IEvent {
    (event: "migrationStateChanged", listener: (migrationState: MigrationState) => void);
}

export interface IMigratable extends IEventProvider<IMigrationEvents> {
    // attach()?
    readonly version: string;
    /**
     * Initialize must be called after constructing the IApp.  Aside from importing the specified data, this is also
     * our opportunity to do whatever async stuff is needed to prepare a sync API surface on the app.
     * Split into import() vs initialize()?
     * Avoid implying that string is a requirement - can even be an in-memory type
     * @param initialData - String data to initially populate the app with.  May only be used in detached state.
     */
    initialize: (initialData?: string) => Promise<void>;
    /**
     * Export the string data from the IApp.  Can be passed into initialize() for a new container to replicate
     * the data.
     */
    exportStringData: () => Promise<string>;

    /**
     * Get the current migration state of the IApp.
     */
    getMigrationState(): MigrationState;

    /**
     * The accepted migratory code details, if migration has been accepted.
     */
    acceptedCodeDetails: IFluidCodeDetails | undefined;
    /**
     * Propose migration using the provided code details.
     * @param codeDetails - The code details that the new IApp should use.
     */
    proposeCodeDetails: (codeDetails: IFluidCodeDetails) => void;

    /**
     * The containerId of the migrated IApp, if migration has completed.
     */
    newContainerId: string | undefined;
    /**
     * Complete the migration with the provided containerId.
     * @param newContainerId - the ID of the container that the collaboration has migrated to.
     */
    finalizeMigration: (newContainerId: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IAppEvents extends IMigrationEvents { }

export interface IApp extends IMigratable, IEventProvider<IAppEvents> {
    /**
     * An inventory tracker list, which is the relevant data for this particular IApp.
     */
    inventoryList: IInventoryList;

    /**
     * Close the app, rendering it inoperable and closing connections.
     */
    close(): void;
}

export interface IContainerKillBitEvents extends IEvent {
    (event: "codeDetailsAccepted" | "migrated", listener: () => void);
}

export interface IContainerKillBit extends IEventProvider<IContainerKillBitEvents> {
    migrated: boolean;
    newContainerId: string | undefined;
    setNewContainerId(id: string): Promise<void>;
    codeDetailsProposed: boolean;
    acceptedCodeDetails: IFluidCodeDetails | undefined;
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
