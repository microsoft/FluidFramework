/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import type { IImportExportModel, IVersionedModel } from "./migratableModel";
import type { ISameContainerMigrationTool } from "./sameContainerMigrationTool";

export interface ISameContainerMigratableModelEvents extends IEvent {
	(event: "connected", listener: () => void);
}

// TODO: Is there a better way to express the unknown format here?  I think I'd prefer to put the burden of calling
// supportsDataFormat() on the callers of importData() (and allow implementers of ISameContainerMigratableModel to assume
// importData() is called with valid data).
export interface ISameContainerMigratableModel
	extends IVersionedModel,
		IImportExportModel<unknown, unknown>,
		IEventProvider<ISameContainerMigratableModelEvents> {
	/**
	 * The tool that will be used to facilitate the migration.
	 * TODO: Currently this is the only difference as compared to IMigratableModel (which has a non-same-container tool).
	 * Can we merge these interfaces later somehow?
	 */
	readonly migrationTool: ISameContainerMigrationTool;

	/**
	 * Returns if the runtime is currently connected.
	 */
	connected(): boolean;

	/**
	 * Close the model, rendering it inoperable and closing connections.
	 * TODO: Decide whether the closing is an integral part of the migration, or if the caller should do the closing.
	 */
	close(): void;
}
