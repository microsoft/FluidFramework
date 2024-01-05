/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The **fluid-framework** package bundles a collection of Fluid Framework client libraries for easy use
 * when paired with a corresponding service client library (for example,
 * `\@fluidframework/azure-client` or `\@fluidframework/tinylicious-client`).
 *
 * @packageDocumentation
 */

export type { ICriticalContainerError } from "@fluidframework/container-definitions";
export { AttachState, ContainerErrorType } from "@fluidframework/container-definitions";
export { DriverErrorType } from "@fluidframework/driver-definitions";
export { ConnectionState } from "@fluidframework/container-loader";
export type {
	ContainerSchema,
	DataObjectClass,
	IConnection,
	IFluidContainer,
	IFluidContainerEvents,
	IMember,
	IServiceAudience,
	IServiceAudienceEvents,
	LoadableObjectClass,
	LoadableObjectClassRecord,
	LoadableObjectCtor,
	MemberChangedListener,
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
	TreeApi,
	TreeArrayNodeBase,
	TreeFieldFromImplicitField,
	TreeLeafValue,
	TreeMapNode,
	TreeMapNodeBase,
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
} from "@fluidframework/tree";
export {
	create,
	disposeSymbol,
	FieldKind,
	FieldSchema,
	IterableTreeListContent,
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
