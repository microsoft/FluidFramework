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
	type IEntryPointPiece,
	loadCompositeRuntime,
} from "./compositeRuntime/index.js";
export type {
	IAcceptedMigrationDetails,
	MigrationState,
} from "./migrationTool/index.js";
export {
	type CreateDetachedContainerCallback,
	type ExportDataCallback,
	type IMigrator,
	type IMigratorEntryPoint,
	type IMigratorEvents,
	type ImportDataCallback,
	type LoadSourceContainerCallback,
	makeCreateDetachedContainerCallback,
	makeSeparateContainerMigrationCallback,
	makeMigratorEntryPointPiece,
	type MigrationCallback,
	type SeparateContainerMigrationResult,
} from "./migrator/index.js";
