/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import type { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { SharedString } from "@fluidframework/sequence";

export interface IModelLoader {
    // TODO: Make async to support dynamic loading of model
    /**
     * Check if the IModelLoader knows how to instantiate an appropriate model for the provided container code version.
     * @param version - the container code version to check
     */
    isVersionSupported(version: string): boolean;

    /**
     * Create a detached model using the specified version of container code.
     * @param version - the container code version to create a model for
     */
    createDetached(version: string): Promise<{ model: IMigratable; attach: () => Promise<string>; }>;

    /**
     * Load a model for the container with the given id.
     * @param id - the id of the container to load
     */
    loadExisting(id: string): Promise<IMigratable>;
}

export enum MigrationState {
    collaborating,
    migrating,
    migrated,
}

export interface IMigrationEvents extends IEvent {
    (event: "migrating" | "migrated", listener: () => void);
}

// A "migratable" is a model that can be migrated.
export interface IMigratable extends IEventProvider<IMigrationEvents> {
    /**
     * The string version of the model, matching the version of the container code it's paired with.
     */
    readonly version: string;

    /**
     * importStringData must be called after initialization but before modifying or attaching the model (i.e. can only
     * be called on an unaltered, detached model).  Here I use a string as the export/import format, but it could be
     * some other format if you prefer.
     */
    importStringData: (initialData: string) => Promise<void>;
    /**
     * Export the string data from the model.  Can be passed into initialize() for a new container to replicate
     * the data.
     */
    exportStringData: () => Promise<string>;

    /**
     * Get the current migration state of the model.
     */
    getMigrationState(): MigrationState;

    /**
     * The accepted migratory version, if migration has been accepted.
     */
    acceptedVersion: string | undefined;
    /**
     * Propose migration using the provided version.
     * @param version - The version that the new model should use.
     */
    proposeVersion: (version: string) => void;

    /**
     * The containerId of the migrated model, if migration has completed.
     */
    newContainerId: string | undefined;
    /**
     * Complete the migration with the provided containerId.
     * @param newContainerId - the ID of the container that the collaboration has migrated to.
     */
    finalizeMigration: (newContainerId: string) => Promise<void>;

    /**
     * Close the model, rendering it inoperable and closing connections.
     * TODO: Decide whether the closing is an integral part of the migration, or if the caller should do the closing.
     */
    close(): void;
}

export interface IMigratorEvents extends IEvent {
    (event: "migrated", listener: (newModel: IMigratable, newModelId: string) => void);
    (event: "migrating", listener: () => void);
    (event: "migrationNotSupported", listener: (version: string) => void);
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IMigrator extends IEventProvider<IMigratorEvents> {
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IInventoryListAppEvents extends IMigrationEvents { }

/**
 * For demo purposes this is a super-simple interface, but in a real scenario this should have all relevant surface
 * for the application to run.
 */
export interface IInventoryListApp extends IMigratable, IEventProvider<IInventoryListAppEvents> {
    /**
     * An inventory tracker list.
     */
    inventoryList: IInventoryList;
}

export interface IContainerKillBitEvents extends IEvent {
    (event: "codeDetailsAccepted" | "migrated", listener: () => void);
}

export interface IContainerKillBit extends IEventProvider<IContainerKillBitEvents> {
    migrated: boolean;
    newContainerId: string | undefined;
    setNewContainerId(id: string): Promise<void>;
    codeDetailsAccepted: boolean;
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
