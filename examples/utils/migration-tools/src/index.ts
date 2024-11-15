/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @packageDocumentation
 * This package contains tools for migrating data from one version to another, used by Fluid examples.
 * They are not currently intended for use in production scenarios.
 */

export {
	CompositeEntryPoint,
	IEntryPointPiece,
	loadCompositeRuntime,
} from "./compositeRuntime/index.js";
export type {
	DataTransformationCallback,
	IAcceptedMigrationDetails,
	IImportExportModel,
	IMigratableModel,
	IMigrationTool,
	IMigrationToolEvents,
	IMigrator,
	IMigratorEvents,
	IVersionedModel,
	MigrationState,
} from "./interfaces/index.js";
export { migrationToolEntryPointPiece, MigrationToolFactory } from "./migrationTool/index.js";
export {
	ISimpleLoader,
	SessionStorageSimpleLoader,
	SimpleLoader,
} from "./simpleLoader/index.js";
export {
	getModelAndMigrationToolFromContainer,
	SimpleLoaderMigrator,
} from "./simpleLoaderMigrator.js";
