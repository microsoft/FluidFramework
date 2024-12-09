/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

import type { IAcceptedMigrationDetails, MigrationState } from "../migrationTool/index.js";

// #region IMigrator

/**
 * @alpha
 */
export interface IMigratorEvents extends IEvent {
	(event: "stopping" | "migrating" | "migrated", listener: () => void);
	(event: "migrationNotSupported", listener: (version: string) => void);
}

/**
 * @alpha
 */
export interface IMigrator {
	readonly events: IEventProvider<IMigratorEvents>;

	/**
	 * The result of the migration, if complete.  Likely the container ID of the new container.
	 */
	readonly migrationResult: unknown | undefined;

	/**
	 * The migration state of the current model.  Note that since we swap out for the new model as soon as migration
	 * completes, we'll only ever see this as collaborating or migrating, never migrated.
	 */
	readonly migrationState: MigrationState;

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
