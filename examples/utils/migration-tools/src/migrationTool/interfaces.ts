/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

/**
 * The collaboration session may be in one of four states:
 * * collaborating - normal collaboration is ongoing.  The client may send data.
 * * stopping - a proposal to migrate has been made, but not accepted yet.  The client must stop sending data.
 * * migrating - a proposal to migrate has been accepted.  The data is currently being migrated.
 * * migrated - migration has completed and the new container is available.
 * @alpha
 */
export type MigrationState = "collaborating" | "stopping" | "migrating" | "migrated";

/**
 * The details of the accepted migration.  Signifies that the collaboration has agreed to migrate whatever
 * data was present at sequence number migrationSequenceNumber to use version newVersion.
 * @alpha
 */
export interface IAcceptedMigrationDetails {
	/**
	 * The version to migrate to.
	 */
	newVersion: string;
	/**
	 * The sequence number indicating the data state to migrate.
	 */
	migrationSequenceNumber: number;
}

/**
 * @alpha
 */
export interface IMigrationToolEvents extends IEvent {
	(event: "stopping" | "migrating" | "migrated", listener: () => void);
	(event: "connected" | "disconnected", listener: () => void);
	(event: "disposed", listener: () => void);
}

/**
 * @alpha
 */
export interface IMigrationTool {
	readonly events: IEventProvider<IMigrationToolEvents>;

	readonly connected: boolean;
	/**
	 * The current state of migration.
	 */
	readonly migrationState: MigrationState;

	/**
	 * The result of the migration (e.g. the new container ID), if the migration has fully completed.
	 */
	readonly migrationResult: unknown | undefined;
	/**
	 * Set the container id where the migrated content can be found, finalizing the migration.
	 * @param migrationResult - the result of the migration, e.g. the new container id
	 */
	finalizeMigration(migrationResult: unknown): Promise<void>;

	/**
	 * The version string of the proposed new version to use, if one has been proposed.
	 */
	readonly proposedVersion: string | undefined;
	/**
	 * The details of the accepted migration, if one has been accepted.
	 */
	readonly acceptedMigration: IAcceptedMigrationDetails | undefined;
	/**
	 * Propose a new version to use.
	 * @param newVersion - the version string
	 */
	proposeVersion: (newVersion: string) => void;
}
