/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The `map` library provides interfaces and implementing classes for map-like distributed data structures.
 *
 * @remarks The following distributed data structures are defined in this library:
 *
 * - {@link SharedMap}
 *
 * - {@link SharedDirectory}
 *
 * @packageDocumentation
 */

export type {
	IDirectory,
	IDirectoryEvents,
	IDirectoryValueChanged,
	ISharedDirectory,
	ISharedDirectoryEvents,
	ISharedMap,
	ISharedMapEvents,
	IValueChanged,
} from "./interfaces.js";
export { SharedMap } from "./mapFactory.js";
export { SharedDirectory } from "./directoryFactory.js";

// Legacy exports that should be deprecated and removed.
export type { ISerializableValue } from "./internalInterfaces.js";
export { MapFactory } from "./mapFactory.js";
export { DirectoryFactory } from "./directoryFactory.js";
export type {
	ICreateInfo,
	IDirectoryNewStorageFormat,
	IDirectoryDataObject,
} from "./directory.js";
