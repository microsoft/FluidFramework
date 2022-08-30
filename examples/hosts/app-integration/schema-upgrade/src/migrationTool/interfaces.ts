/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/common-definitions";

export type MigrationState = "collaborating" | "stopping" | "migrating" | "migrated";

export interface IMigrationToolEvents extends IEvent {
    (event: "stopping" | "migrating" | "migrated", listener: () => void);
}

export interface IMigrationTool extends IEventProvider<IMigrationToolEvents> {
    /**
     * The current state of migration.
     */
    migrationState: MigrationState;

    /**
     * The container id where the migrated content can be found, if the migration has fully completed.
     */
    newContainerId: string | undefined;
    /**
     * Set the container id where the migrated content can be found, finalizing the migration.
     * @param id - the container id
     */
    finalizeMigration(id: string): Promise<void>;

    /**
     * The version string of the proposed new version to use, if one has been proposed.
     */
    proposedVersion: string | undefined;
    /**
     * The version string of the accepted new version to use, if one has been accepted.
     */
    acceptedVersion: string | undefined;
    /**
     * Propose a new version to use.
     * @param newVersion - the version string
     */
    proposeVersion: (newVersion: string) => void;

    /**
     * Volunteer to perform the migration.
     * @returns A promise which resolves when the local client has been selected to perform the migration.  The
     * migration may have already been completed prior to being selected.
     */
    volunteerForMigration(): Promise<void>;
    /**
     * Whether the local client is selected to perform the migration.
     */
    haveMigrationTask(): boolean;
}
