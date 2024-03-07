/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The `map` library provides interfaces and implementing classes for map-like distributed data structures.
 *
 * @remarks The following distributed data structures are defined in this library:
 *
 * - {@link AttributableMap}
 *
 * @packageDocumentation
 */

export {
	ISerializableValue,
	ISerializedValue,
	ISharedMap,
	ISharedMapEvents,
	IValueChanged,
} from "./interfaces.js";
export { LocalValueMaker, ILocalValue } from "./localValues.js";
export { MapFactory, AttributableMap } from "./map.js";
