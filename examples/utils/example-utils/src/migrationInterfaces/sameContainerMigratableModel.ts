/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/legacy";
import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";

import type { ISameContainerMigrationTool } from "./sameContainerMigrationTool.js";

/**
 * A model with a detectable version.
 *
 * @remarks
 * It's appropriate to use this version to deduce the more specific type of model.
 * @internal
 */
export interface IVersionedModel {
	/**
	 * The string version of the model, matching the version of the container code it's paired with.
	 */
	readonly version: string;
}

/**
 * A model that can import data of ImportType when in detached state, and can also export its data to ExportType.
 * @internal
 */
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

/**
 * @internal
 */
export interface ISameContainerMigratableModelEvents extends IEvent {
	(event: "connected", listener: () => void);
}

// TODO: Is there a better way to express the unknown format here?  I think I'd prefer to put the burden of calling
// supportsDataFormat() on the callers of importData() (and allow implementers of ISameContainerMigratableModel to assume
// importData() is called with valid data).
/**
 * @internal
 */
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
	 * A reference to the container associated with this model.
	 * TODO: Similar to the note on the migration tool, can we scope the required exposure here to just what the tool needs?
	 * Exposing the whole IContainer makes it available to a larger audience than should have access to it.
	 */
	readonly container: IContainer;

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
