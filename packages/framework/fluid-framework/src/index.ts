/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Bundles a collection of Fluid Framework client libraries for easy use when paired with a corresponding service client
 * package (e.g. `@fluidframework/azure-client`, `@fluidframework/tinylicious-client`, or `@fluidframework/odsp-client (BETA)`).
 *
 * @packageDocumentation
 */

// ===============================================================
// #region Public, Beta and Alpha (non-legacy) exports
// #region Basic re-exports

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
export type {
	IErrorBase,
	IEventProvider,
	IDisposable,
	IEvent,
	IEventThisPlaceHolder,
	IErrorEvent,
	ErasedType,
	IFluidHandle,
	IFluidLoadable,
	ITelemetryBaseProperties,
	IEventTransformer,
	IProvideFluidLoadable,
	IFluidHandleErased,
	TransformedEvent,
	TelemetryBaseEventPropertyType,
	Tagged,
	ReplaceIEventThisPlaceHolder,
	FluidObject, // Linked in doc comment
	FluidObjectProviderKeys, // Used by FluidObject
	/* eslint-disable import/export -- The event APIs are known to conflict, and this is intended as the exports via `@fluidframework/core-interfaces` are preferred over the deprecated ones from `@fluidframework/tree`. */
	Listeners,
	IsListener,
	Listenable,
	Off,
	/* eslint-enable import/export */
} from "@fluidframework/core-interfaces";

export type { isFluidHandle } from "@fluidframework/runtime-utils";

// Let the tree package manage its own API surface.
// Note: this only surfaces the `@public, @beta and @alpha` API items from the tree package.
/* eslint-disable-next-line
	no-restricted-syntax,
	import/no-internal-modules,
	import/export -- This re-exports all non-conflicting APIs from `@fluidframework/tree`. In cases where * exports conflict with named exports, the named exports take precedence, triggering the `import/export` lint warning (which is intentionally disabled here). This approach ensures that the non-deprecated versions of the event APIs from `@fluidframework/core-interfaces`(provided as named exports) replace the deprecated ones from `@fluidframework/tree`. The preferred versions of the event APIs are those exported via `@fluidframework/core-interfaces`.
	*/
export * from "@fluidframework/tree/alpha";

// End of basic public+beta+alpha exports - nothing above this line should
// depend on an /internal path.
// #endregion Basic re-exports
// ---------------------------------------------------------------
// #region Custom re-exports

import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import type { ITree } from "@fluidframework/tree";
import {
	SharedTree as OriginalSharedTree,
	configuredSharedTree as originalConfiguredSharedTree,
	type SharedTreeOptions,
} from "@fluidframework/tree/internal";

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
export const SharedTree: SharedObjectKind<ITree> = OriginalSharedTree;

/**
 * {@link SharedTree} but allowing a non-default configuration.
 * @remarks
 * This is useful for debugging and testing to opt into extra validation or see if opting out of some optimizations fixes an issue.
 * @example
 * ```typescript
 * import {
 * 	ForestType,
 * 	TreeCompressionStrategy,
 * 	configuredSharedTree,
 * 	typeboxValidator,
 * } from "@fluid-framework/alpha";
 * const SharedTree = configuredSharedTree({
 * 	forest: ForestType.Reference,
 * 	jsonValidator: typeboxValidator,
 * 	treeEncodeType: TreeCompressionStrategy.Uncompressed,
 * });
 * ```
 * @alpha
 */
export function configuredSharedTree(options: SharedTreeOptions): SharedObjectKind<ITree> {
	return originalConfiguredSharedTree(options);
}

// #endregion Custom re-exports
// #endregion

// ===============================================================
// #region Legacy exports

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

export { SharedDirectory, SharedMap } from "@fluidframework/map/internal";

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
	ISharedSegmentSequence,
} from "@fluidframework/sequence/internal";

export type {
	IntervalType,
	SequenceDeltaEvent,
	SequenceEvent,
	SequenceInterval,
	SequenceMaintenanceEvent,
} from "@fluidframework/sequence/internal";

export { SharedString } from "@fluidframework/sequence/internal";

export type {
	ISharedObject,
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";

export type {
	ISequencedDocumentMessage, // Leaked via ISharedObjectEvents
	IBranchOrigin, // Required for ISequencedDocumentMessage
	ITrace, // Required for ISequencedDocumentMessage
} from "@fluidframework/driver-definitions/internal";

// #endregion Legacy exports
