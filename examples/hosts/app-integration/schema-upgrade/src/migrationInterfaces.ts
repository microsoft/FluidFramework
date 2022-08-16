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

export interface IImportExportModel<ImportType, ExportType> {
    /**
     * Permit format checking in a generic manner - without knowing the type of our data or the type of the model,
     * we can still check whether the model supports that data.
     */
    supportsDataFormat: (initialData: unknown) => initialData is ImportType;

    /**
     * importData must be called after initialization but before modifying or attaching the model (i.e. can only
     * be called on an unaltered, detached model).
     */
    importData: (initialData: ImportType) => Promise<void>;

    /**
     * Export the data from the model.  Can be passed into importData() for a new container to replicate the data.
     */
    exportData: () => Promise<ExportType>;
}

export enum MigrationState {
    collaborating,
    migrating,
    migrated,
}

export interface IMigratableModelEvents extends IEvent {
    (event: "migrating" | "migrated", listener: () => void);
}

// TODO: Is there a better way to express the unknown format here?  I think I'd prefer to put the burden of calling
// supportsDataFormat() on the callers of importData() (and allow implementers of IMigratableModel to assume
// importData() is called with valid data).
export interface IMigratableModel
    extends IVersionedModel, IImportExportModel<unknown, unknown>, IEventProvider<IMigratableModelEvents> {
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

/**
 * The DataTransformationCallback gives an opportunity to modify the exported data before attempting an import
 * to the new model.  The modelVersion is also provided to inform the appropriate transformation to perform.
 * It is async to permit network calls or lazy-loading the transform logic within the function.
 */
export type DataTransformationCallback = (
    exportedData: unknown,
    modelVersion: string,
) => Promise<unknown>;

export interface IMigratorEvents extends IEvent {
    (event: "migrated" | "migrating", listener: () => void);
    (event: "migrationNotSupported", listener: (version: string) => void);
}

export interface IMigrator extends IEventProvider<IMigratorEvents> {
    /**
     * The currently monitored migratable model.  As the Migrator completes a migration, it will swap in the new
     * migrated model and emit a "migrated" event.
     */
    readonly currentModel: IMigratableModel;

    /**
     * The container id of the current model.
     */
    readonly currentModelId: string;

    /**
     * The migration state of the current model.  Note that since we swap out for the new model as soon as migration
     * completes, we'll only ever see this as collaborating or migrating, never migrated.
     */
    readonly migrationState: MigrationState;
}
