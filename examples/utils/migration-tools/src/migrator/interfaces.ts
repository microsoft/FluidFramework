/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

import type { IAcceptedMigrationDetails, MigrationState } from "../migrationTool/index.js";

// #region Migrator callbacks

/**
 * Callback that should take the given container and export its data in some format.
 * @alpha
 */
export type ExportDataCallback = (sourceContainer: IContainer) => Promise<unknown>;
/**
 * Callback provided to load the source container that data will be exported from.  Should be a separately
 * loaded container to avoid including local changes.
 * @alpha
 */
export type LoadSourceContainerCallback = () => Promise<IContainer>;
/**
 * Callback provided to take desired migration steps after migration has been agreed upon and data has been
 * exported.  Typically creating a new container and importing the data into it.
 * @alpha
 */
export type MigrationCallback = (version: string, exportedData: unknown) => Promise<unknown>;

// #region Entry point

/**
 * The partial type of the entrypoint provided when makeMigratorEntryPointPiece is used.
 * @alpha
 */
export interface IMigratorEntryPoint {
	/**
	 * Retrieve the IMigrator from the container.  It will use the provided callbacks to load the source
	 * container for data export and perform the migration.
	 */
	getMigrator: (
		loadSourceContainerCallback: LoadSourceContainerCallback,
		migrationCallback: MigrationCallback,
	) => Promise<IMigrator>;
}

// #region IMigrator

/**
 * Events emitted by the IMigrator.
 * @alpha
 */
export interface IMigratorEvents extends IEvent {
	/**
	 * As the migrator progresses between migration states, it emits the corresponding event.
	 */
	(event: "stopping" | "migrating" | "migrated", listener: () => void): void;
}

/**
 * A tool used to propose and monitor container migration.
 * @alpha
 */
export interface IMigrator {
	/**
	 * Event emitter object.
	 */
	readonly events: IEventProvider<IMigratorEvents>;

	/**
	 * The current state of migration.
	 */
	readonly migrationState: MigrationState;

	/**
	 * The version string of the proposed new version to use, if one has been proposed.
	 */
	readonly proposedVersion: string | undefined;

	/**
	 * The details of the accepted migration, if one has been accepted.
	 * TODO: Consider hiding this - currently just used for debug output in the example.
	 */
	readonly acceptedMigration: IAcceptedMigrationDetails | undefined;

	/**
	 * The result of the migration, if complete.  Likely the container ID of the new container.
	 */
	readonly migrationResult: unknown | undefined;

	/**
	 * Propose a new version to use.
	 * @param newVersion - the version string
	 */
	proposeVersion: (newVersion: string) => void;
}
