/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IMigrationTool } from "./migrationTool.js";

/**
 * @internal
 */
export interface IVersionedModel {
	/**
	 * The string version of the model, matching the version of the container code it's paired with.
	 */
	readonly version: string;
}

/**
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

// TODO: Is there a better way to express the unknown format here?  I think I'd prefer to put the burden of calling
// supportsDataFormat() on the callers of importData() (and allow implementers of IMigratableModel to assume
// importData() is called with valid data).
/**
 * @internal
 */
export interface IMigratableModel
	extends IVersionedModel,
		IImportExportModel<unknown, unknown> {
	/**
	 * The tool that will be used to facilitate the migration.
	 */
	readonly migrationTool: IMigrationTool;

	/**
	 * Close the model, rendering it inoperable and closing connections.
	 * TODO: Decide whether the closing is an integral part of the migration, or if the caller should do the closing.
	 */
	close(): void;
}
