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
export { AttachState } from "@fluidframework/container-definitions";
export { ConnectionState } from "@fluidframework/container-loader";
export type {
	ContainerAttachProps,
	ContainerSchema,
	IConnection,
	IFluidContainer,
	IFluidContainerEvents,
	IMember,
	InitialObjects,
	IServiceAudience,
	IServiceAudienceEvents,
	MemberChangedListener,
	Myself,
} from "@fluidframework/fluid-static";
export type { SharedObjectKind } from "@fluidframework/shared-object-base";

// Let the tree package manage its own API surface, we will simply reflect it here.
// Note: this only surfaces the `@public` API items from the tree package. If the `@beta` and `@alpha` items are
// desired, they can be added by re-exporting from one of the package's aliased export paths instead (e.g. `tree
// alpha` to surface everything `@alpha` and higher).
// eslint-disable-next-line no-restricted-syntax, import/export
export * from "@fluidframework/tree";

import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import { SharedTree as OriginalSharedTree } from "@fluidframework/tree/internal";
import { type ITree } from "@fluidframework/tree";

/**
 * A hierarchical data structure for collaboratively editing strongly typed JSON-like trees
 * of objects, arrays, and other data types.
 * @privateRemarks
 * Here we reexport SharedTree, but with the `@alpha` types (`ISharedObjectKind`) removed, just keeping the `SharedObjectKind`.
 * Doing this requires creating this new typed export rather than relying on a reexport directly from the tree package.
 * The tree package itself does not do this because it's API needs to be usable from the encapsulated API which requires `ISharedObjectKind`.
 * This package however is not intended for use by users of the encapsulated API, and therefor it can discard that interface.
 * @public
 */
// eslint-disable-next-line import/export
export const SharedTree: SharedObjectKind<ITree> = OriginalSharedTree;

// ===============================================================
// Legacy exports

export {
	ContainerErrorTypes,
	type IDeltaManager,
	type IDeltaManagerEvents,
	type IDeltaSender,
	type IDeltaQueue,
	type ReadOnlyInfo,
	type IConnectionDetails,
	type IDeltaQueueEvents,
} from "@fluidframework/container-definitions/internal";

export type {
	IAnyDriverError,
	IDriverErrorBase,
	DriverErrorTypes,
} from "@fluidframework/driver-definitions/internal";

export type {
	IDirectory,
	IDirectoryEvents,
	IDirectoryValueChanged,
	ISharedDirectory,
	ISharedDirectoryEvents,
	ISharedMap,
	ISharedMapEvents,
	IValueChanged,
} from "@fluidframework/map/internal";

export {
	DirectoryFactory,
	MapFactory,
	SharedDirectory,
	SharedMap,
} from "@fluidframework/map/internal";

export type {
	DeserializeCallback,
	InteriorSequencePlace,
	IInterval,
	IIntervalCollectionEvent,
	IIntervalCollection,
	IntervalIndex,
	IntervalStickiness,
	ISequenceDeltaRange,
	ISerializableInterval,
	ISerializedInterval,
	ISharedIntervalCollection,
	ISharedSegmentSequenceEvents,
	ISharedString,
	SequencePlace,
	SharedStringSegment,
	Side,
} from "@fluidframework/sequence/internal";

export {
	IntervalType,
	SequenceDeltaEvent,
	SequenceEvent,
	SequenceInterval,
	SequenceMaintenanceEvent,
	SharedString,
	type ISharedSegmentSequence,
} from "@fluidframework/sequence/internal";

export type {
	SharedObject,
	IFluidSerializer,
	SharedObjectCore,
	ISharedObject,
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";
