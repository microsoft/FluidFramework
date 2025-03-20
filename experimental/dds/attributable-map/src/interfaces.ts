/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEventThisPlaceHolder } from "@fluidframework/core-interfaces";
import { AttributionKey } from "@fluidframework/runtime-definitions/internal";
import {
	ISharedObject,
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";
/**
 * Type of "valueChanged" event parameter.
 * @internal
 */
export interface IValueChanged {
	/**
	 * The key storing the value that changed.
	 */
	key: string;

	/**
	 * The value that was stored at the key prior to the change.
	 */
	// TODO: Use `unknown` instead (breaking change).

	previousValue: any;
}

/**
 * Events emitted in response to changes to the {@link ISharedMap | map} data.
 * @internal
 */
export interface ISharedMapEvents extends ISharedObjectEvents {
	/**
	 * Emitted when a key is set or deleted.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `changed` - Information on the key that changed and its value prior to the change.
	 *
	 * - `local` - Whether the change originated from this client.
	 *
	 * - `target` - The {@link ISharedMap} itself.
	 */
	(
		event: "valueChanged",
		listener: (changed: IValueChanged, local: boolean, target: IEventThisPlaceHolder) => void,
	);

	/**
	 * Emitted when the map is cleared.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `local` - Whether the clear originated from this client.
	 *
	 * - `target` - The {@link ISharedMap} itself.
	 */
	(event: "clear", listener: (local: boolean, target: IEventThisPlaceHolder) => void);
}

/**
 * The SharedMap distributed data structure can be used to store key-value pairs. It provides the same API for setting
 * and retrieving values that JavaScript developers are accustomed to with the
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map | Map} built-in object.
 * However, the keys of a SharedMap must be strings, and the values must either be a JSON-serializable object or a
 * {@link @fluidframework/datastore#FluidObjectHandle}.
 *
 * For more information, including example usages, see {@link https://fluidframework.com/docs/data-structures/map/}.
 * @internal
 */
// TODO: Use `unknown` instead (breaking change).

export interface ISharedMap extends ISharedObject<ISharedMapEvents>, Map<string, any> {
	/**
	 * Retrieves the given key from the map if it exists.
	 * @param key - Key to retrieve from
	 * @returns The stored value, or undefined if the key is not set
	 */
	// TODO: Use `unknown` instead (breaking change).

	get<T = any>(key: string): T | undefined;

	/**
	 * Sets the value stored at key to the provided value.
	 * @param key - Key to set
	 * @param value - Value to set
	 * @returns The {@link ISharedMap} itself
	 */
	set<T = unknown>(key: string, value: T): this;

	/**
	 * Get the attribution of one entry through its key
	 * @param key - Key to track
	 * @returns The attribution of related entry
	 */
	getAttribution(key: string): AttributionKey | undefined;

	/**
	 * Get all attribution of the map
	 * @returns All attribution in the map
	 */
	getAllAttribution(): Map<string, AttributionKey> | undefined;
}

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
 * @deprecated This type is legacy and deprecated.
 * @internal
 */
export interface ISerializableValue {
	/**
	 * A type annotation to help indicate how the value serializes.
	 */
	type: string;

	/**
	 * The JSONable representation of the value.
	 */

	value: any;

	/**
	 * The attribution key attached with the entry
	 */
	attribution?: AttributionKey | number;
}

/**
 * Serialized {@link ISerializableValue} counterpart.
 * @internal
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

	/**
	 * The attribution key or seq number attached with the entry
	 */
	attribution?: string;
}
