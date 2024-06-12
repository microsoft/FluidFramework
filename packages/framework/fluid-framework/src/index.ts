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

// ===============================================================
// #region Public exports
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
} from "@fluidframework/core-interfaces";

// Let the tree package manage its own API surface, we will simply reflect it here.
// Note: this only surfaces the `@public` API items from the tree package. If the `@beta` and `@alpha` items are
// desired, they can be added by re-exporting from one of the package's aliased export paths instead (e.g. `tree
// alpha` to surface everything `@alpha` and higher).
// eslint-disable-next-line no-restricted-syntax, import/export
export * from "@fluidframework/tree";

// End of basic public exports - nothing above this line should
// depend on an /internal path.
// #endregion Basic re-exports
// ---------------------------------------------------------------
// #region Custom re-exports

import type { IFluidLoadable, IEventProvider } from "@fluidframework/core-interfaces";
import { SharedMap as OriginalSharedMap } from "@fluidframework/map/internal";
import type { ISharedMapEvents } from "@fluidframework/map/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import type { ITree } from "@fluidframework/tree";
import { SharedTree as OriginalSharedTree } from "@fluidframework/tree/internal";

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
 * The SharedMap distributed data structure can be used to store key-value pairs.
 *
 * @remarks
 * SharedMap provides the same API for setting and retrieving values that JavaScript developers are accustomed to with the
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map | Map} built-in object.
 * However, the keys of a SharedMap must be strings, and the values must either be a JSON-serializable object or a
 * {@link @fluidframework/datastore#FluidObjectHandle}.
 *
 * Note: unlike JavaScript maps, SharedMap does not make any guarantees regarding enumeration order.
 *
 * For more information, including example usages, see {@link https://fluidframework.com/docs/data-structures/map/}.
 * @privateRemarks
 * This interface is very similar to ISharedMap from `@fluidframework/map`, but avoids referencing encapsulated API concepts like ISharedObject,
 * and uses unknown instead of `any` for outputs.
 * @sealed
 * @beta
 */
export interface ISharedMap
	extends IEventProvider<ISharedMapEvents>,
		Map<string, unknown>,
		IFluidLoadable {
	/**
	 * Retrieves the given key from the map if it exists.
	 * @param key - Key to retrieve from
	 * @returns The stored value, or undefined if the key is not set
	 */
	get<T = unknown>(key: string): T | undefined;

	/**
	 * Sets the value stored at key to the provided value.
	 * @param key - Key to set
	 * @param value - Value to set
	 * @returns The {@link ISharedMap} itself
	 */
	set<T = unknown>(key: string, value: T): this;
}

/**
 * Entrypoint for {@link @fluidframework/map#ISharedMap} creation.
 * @privateRemarks
 * See note on SharedTree.
 * @beta
 */
export const SharedMap: SharedObjectKind<ISharedMap> = OriginalSharedMap;

// #endregion Custom re-exports
// #endregion Public exports

// ===============================================================
// #region Legacy exports

export type {
	IDirectory,
	IDirectoryEvents,
	IDirectoryValueChanged,
	ISharedDirectory,
	ISharedDirectoryEvents,
	ISharedMapEvents,
	IValueChanged,
} from "@fluidframework/map/internal";

export { SharedDirectory } from "@fluidframework/map/internal";

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

export {
	IntervalType,
	SequenceDeltaEvent,
	SequenceEvent,
	SequenceInterval,
	SequenceMaintenanceEvent,
	SharedString,
} from "@fluidframework/sequence/internal";

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
