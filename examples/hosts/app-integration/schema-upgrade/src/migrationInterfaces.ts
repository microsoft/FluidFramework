/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/common-definitions";

export interface IVersionedModel {
    /**
     * The string version of the model, matching the version of the container code it's paired with.
     */
    readonly version: string;
}

export interface IExportImportModel {
    /**
     * importStringData must be called after initialization but before modifying or attaching the model (i.e. can only
     * be called on an unaltered, detached model).  Here I use a string as the export/import format, but it could be
     * some other format if you prefer.
     */
    importStringData: (initialData: string) => Promise<void>;

    /**
     * Export the string data from the model.  Can be passed into importStringData() for a new container to replicate
     * the data.
     */
    exportStringData: () => Promise<string>;
}

export enum MigrationState {
    collaborating,
    migrating,
    migrated,
}

export interface IMigratableModelEvents extends IEvent {
    (event: "migrating" | "migrated", listener: () => void);
}

export interface IMigratableModel
    extends IVersionedModel, IExportImportModel, IEventProvider<IMigratableModelEvents> {
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
    (event: "migrated", listener: (newModel: IMigratableModel, newModelId: string) => void);
    (event: "migrating", listener: () => void);
    (event: "migrationNotSupported", listener: (version: string) => void);
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IMigrator extends IEventProvider<IMigratorEvents> {
}
