/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import type { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { SharedString } from "@fluidframework/sequence";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IModelLoader {
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
    /**
     * The string version of the App, matching the version of the container code it's paired with.
     */
    readonly version: string;

    /**
     * importStringData must be called after initialization but before modifying or attaching the app (i.e. can only
     * be called on an unaltered, detached app).  Here I use a string as the export/import format, but it could be
     * some other format if you prefer.
     */
    importStringData: (initialData: string) => Promise<void>;
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
     * The accepted migratory version, if migration has been accepted.
     */
    acceptedVersion: string | undefined;
    /**
     * Propose migration using the provided version.
     * @param version - The version that the new IApp should use.
     */
    proposeVersion: (version: string) => void;

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
     * Initialize must be called after constructing the IApp.  This is where we do whatever async stuff is needed
     * to prepare a sync API surface on the app.
     */
    initialize: () => Promise<void>;
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
