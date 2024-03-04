/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Bundles a collection of Fluid Framework client libraries for easy use when paired with a corresponding service client
 * package (e.g. `@fluidframework/azure-client`, `@fluidframework/tinylicious-client`, or `@fluid-experimental/osdp-client (BETA)`).
 *
 * @packageDocumentation
 */

export type {
	ConnectionState as ConnectionStateType, // TODO: deduplicate ConnectionState types
	ICriticalContainerError,
} from "@fluidframework/container-definitions";
export { AttachState, ContainerErrorTypes } from "@fluidframework/container-definitions";
export { DriverErrorTypes } from "@fluidframework/driver-definitions";
export { ConnectionState } from "@fluidframework/container-loader";
export type {
	ContainerAttachProps,
	ContainerSchema,
	DataObjectClass,
	IConnection,
	IFluidContainer,
	IFluidContainerEvents,
	IMember,
	InitialObjects,
	IServiceAudience,
	IServiceAudienceEvents,
	LoadableObjectClass,
	LoadableObjectClassRecord,
	LoadableObjectCtor,
	MemberChangedListener,
	Myself,
	SharedObjectClass,
} from "@fluidframework/fluid-static";
export type { ISharedMap, ISharedMapEvents, IValueChanged } from "@fluidframework/map";
export { SharedMap } from "@fluidframework/map";

export type {
	AllowedTypes,
	ApplyKind,
	ArrayToUnion,
	Events,
	ExtractItemType,
	FlexList,
	FlexListToUnion,
	IDisposable,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	InsertableObjectFromSchemaRecord,
	InsertableTreeFieldFromImplicitField,
	InsertableTreeNodeFromImplicitAllowedTypes,
	InsertableTypedNode,
	IsEvent,
	ISubscribable,
	ITree,
	LazyItem,
	MakeNominal,
	NodeBuilderData,
	NodeFromSchema,
	ObjectFromSchemaRecord,
	RestrictiveReadonlyRecord,
	ScopedSchemaName,
	TreeApi,
	TreeArrayNodeBase,
	TreeFieldFromImplicitField,
	TreeLeafValue,
	TreeMapNode,
	TreeNodeEvents,
	TreeNodeFromImplicitAllowedTypes,
	TreeNodeSchema,
	TreeNodeSchemaClass,
	TreeNodeSchemaCore,
	TreeNodeSchemaNonClass,
	TreeView,
	TreeViewEvents,
	Unhydrated,
	WithType,
	SchemaIncompatible,
} from "@fluidframework/tree";
export {
	disposeSymbol,
	FieldKind,
	FieldSchema,
	IterableTreeArrayContent,
	NodeKind,
	SchemaFactory,
	SharedTree,
	Tree,
	TreeArrayNode,
	TreeConfiguration,
	TreeNode,
	TreeStatus,
	type,
} from "@fluidframework/tree";
