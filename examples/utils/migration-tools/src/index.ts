/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @packageDocumentation
 * This package contains tools for migrating data from one version to another, used by Fluid examples.
 * They are not currently intended for use in production scenarios.
 */

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
export {
	CreateModelCallback,
	IAttachedMigratableModel,
	IDetachedMigratableModel,
	IMigratableModelContainerRuntimeEntryPoint,
	IMigratableModelLoader,
	loadMigratableRuntime,
	MigratableModelLoader,
	MigratableSessionStorageModelLoader,
	MigratableTinyliciousModelLoader,
} from "./migratableModelLoader/index.js";
export { MigrationToolFactory } from "./migrationTool.js";
export { Migrator } from "./migrator.js";
