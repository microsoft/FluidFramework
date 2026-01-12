/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Provide EventEmitter from example-utils to avoid examples all directly depending on
// a @fluid-internal package while EventEmitter support is finalized.
import { EventEmitter } from "@fluid-internal/client-utils";
export {
	/**
	 * @public
	 */
	// eslint-disable-next-line unicorn/prefer-export-from
	EventEmitter,
};

export {
	ContainerViewRuntimeFactory,
	type ViewCallback,
	getDataStoreEntryPoint,
	type IFluidMountableViewEntryPoint,
} from "./containerViewRuntimeFactory.js";
export type {
	DataTransformationCallback,
	IImportExportModel,
	ISameContainerMigratableModel,
	ISameContainerMigratableModelEvents,
	ISameContainerMigrationTool,
	ISameContainerMigrationToolEvents,
	ISameContainerMigrator,
	ISameContainerMigratorEvents,
	IVersionedModel,
	SameContainerMigrationState,
} from "./migrationInterfaces/index.js";
export {
	SameContainerMigrationTool,
	SameContainerMigrationToolInstantiationFactory,
} from "./migrationTool/index.js";
export { SameContainerMigrator } from "./migrator/index.js";
export {
	type IDetachedModel,
	type IModelContainerRuntimeEntryPoint,
	type IModelLoader,
	ModelContainerRuntimeFactory,
	ModelLoader,
	SessionStorageModelLoader,
	StaticCodeLoader,
	TinyliciousModelLoader,
} from "./modelLoader/index.js";
export {
	type IFluidMountableView,
	type IProvideFluidMountableView,
	MountableView,
} from "./mountableView/index.js";
export {
	CollaborativeInput,
	CollaborativeTextArea,
	type ICollaborativeInputProps,
	type ICollaborativeInputState,
	type ICollaborativeTextAreaProps,
} from "./reactInputs/index.js";
export {
	type ISharedStringHelperEvents,
	type ISharedStringHelperTextChangedEventArgs,
	SharedStringHelper,
} from "./SharedStringHelper.js";
