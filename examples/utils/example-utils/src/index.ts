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
	EventEmitter,
};

export {
	ContainerViewRuntimeFactory,
	ViewCallback,
	getDataStoreEntryPoint,
	IFluidMountableViewEntryPoint,
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
	IDetachedModel,
	IModelContainerRuntimeEntryPoint,
	IModelLoader,
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
	ICollaborativeInputProps,
	ICollaborativeInputState,
	ICollaborativeTextAreaProps,
} from "./reactInputs/index.js";
export {
	ISharedStringHelperEvents,
	ISharedStringHelperTextChangedEventArgs,
	SharedStringHelper,
} from "./SharedStringHelper.js";
