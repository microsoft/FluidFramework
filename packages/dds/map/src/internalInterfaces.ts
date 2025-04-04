/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ILocalValue } from "./localValues.js";

/**
 * Operation indicating a value should be set for a key.
 * @internal
 */
export interface IMapSetOperation {
	/**
	 * String identifier of the operation type.
	 */
	type: "set";

	/**
	 * Map key being modified.
	 */
	key: string;

	/**
	 * Value to be set on the key.
	 */
	value: ISerializableValue;
}

/**
 * Operation indicating the map should be cleared.
 * @internal
 */
export interface IMapClearOperation {
	/**
	 * String identifier of the operation type.
	 */
	type: "clear";
}

/**
 * Operation indicating a key should be deleted from the map.
 * @internal
 */
export interface IMapDeleteOperation {
	/**
	 * String identifier of the operation type.
	 */
	type: "delete";

	/**
	 * Map key being modified.
	 */
	key: string;
}

/**
 * Metadata for an local `edit` operation.
 */
export interface IMapKeyEditLocalOpMetadata {
	/**
	 * String identifier of the operation type.
	 */
	type: "edit";

	/**
	 * Unique identifier for the local operation.
	 */
	pendingMessageId: number;

	/**
	 * Local value prior to the edit.
	 */
	previousValue: ILocalValue;
}

/**
 * Metadata for an local `add` operation.
 */
export interface IMapKeyAddLocalOpMetadata {
	/**
	 * String identifier of the operation type.
	 */
	type: "add";

	/**
	 * Unique identifier for the local operation.
	 */
	pendingMessageId: number;
}

/**
 * Metadata for an local `clear` operation.
 */
export interface IMapClearLocalOpMetadata {
	/**
	 * String identifier of the operation type.
	 */
	type: "clear";

	/**
	 * Unique identifier for the local operation.
	 */
	pendingMessageId: number;

	/**
	 * Local map contents prior to clearing it.
	 */
	previousMap?: Map<string, ILocalValue>;
}

/**
 * Metadata for a local operation associated with a specific key entry in the map.
 */
export type MapKeyLocalOpMetadata = IMapKeyEditLocalOpMetadata | IMapKeyAddLocalOpMetadata;

/**
 * Metadata for a local operation.
 */
export type MapLocalOpMetadata = IMapClearLocalOpMetadata | MapKeyLocalOpMetadata;

/**
 * The _ready-for-serialization_ format of values contained in DDS contents. This allows us to use
 * {@link ISerializableValue."type"} to understand whether they're storing a Plain JavaScript object,
 * a {@link @fluidframework/shared-object-base#SharedObject}, or a value type.
 *
 * @remarks
 *
 * Note that the in-memory equivalent of ISerializableValue is ILocalValue (similarly holding a type, but with
 * the _in-memory representation_ of the value instead).  An ISerializableValue is what gets passed to
 * JSON.stringify and comes out of JSON.parse. This format is used both for snapshots (loadCore/populate)
 * and ops (set).
 *
 * If type is Plain, it must be a plain JS object that can survive a JSON.stringify/parse.  E.g. a URL object will
 * just get stringified to a URL string and not rehydrate as a URL object on the other side. It may contain members
 * that are ISerializedHandle (the serialized form of a handle).
 *
 * If type is a value type then it must be amongst the types registered via registerValueType or we won't know how
 * to serialize/deserialize it (we rely on its factory via .load() and .store()).  Its value will be type-dependent.
 * If type is Shared, then the in-memory value will just be a reference to the SharedObject.  Its value will be a
 * channel ID.
 *
 * @deprecated This type is legacy and deprecated(AB#8004).
 * @legacy
 * @alpha
 */
export interface ISerializableValue {
	/**
	 * A type annotation to help indicate how the value serializes.
	 */
	type: string;

	/**
	 * The JSONable representation of the value.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	value: any;
}

/**
 * Serialized {@link ISerializableValue} counterpart.
 * @legacy
 * @alpha
 */
export interface ISerializedValue {
	/**
	 * A type annotation to help indicate how the value serializes.
	 */
	type: string;

	/**
	 * String representation of the value.
	 *
	 * @remarks Will be undefined if the original value was undefined.
	 */
	value: string | undefined;
}
