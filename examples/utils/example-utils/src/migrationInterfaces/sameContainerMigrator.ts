/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

import type {
	ISameContainerMigratableModel,
	SameContainerMigrationState,
} from "../migrationInterfaces/index.js";

/**
 * The DataTransformationCallback gives an opportunity to modify the exported data before attempting an import
 * to the new model.  The modelVersion is also provided to inform the appropriate transformation to perform.
 * It is async to permit network calls or lazy-loading the transform logic within the function.
 * @internal
 */
export type DataTransformationCallback = (
	exportedData: unknown,
	modelVersion: string,
) => Promise<unknown>;

/**
 * @internal
 */
export interface ISameContainerMigratorEvents extends IEvent {
	(event: "migrated" | "migrating", listener: () => void);
	(event: "migrationNotSupported", listener: (version: string) => void);
}

/**
 * @internal
 */
export interface ISameContainerMigrator extends IEventProvider<ISameContainerMigratorEvents> {
	/**
	 * The currently monitored migratable model.  As the Migrator completes a migration, it will swap in the new
	 * migrated model and emit a "migrated" event.
	 */
	readonly currentModel: ISameContainerMigratableModel;

	/**
	 * The container id of the current model.
	 */
	readonly currentModelId: string;

	/**
	 * The migration state of the current model.  Note that since we swap out for the new model as soon as migration
	 * completes, we'll only ever see this as collaborating or migrating, never migrated.
	 */
	readonly migrationState: SameContainerMigrationState;
}
