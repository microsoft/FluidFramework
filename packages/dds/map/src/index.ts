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
	ISharedMapCore,
} from "./interfaces.js";
export { MapFactory, SharedMap } from "./mapFactory.js";
export { DirectoryFactory, SharedDirectory } from "./directoryFactory.js";
export type {
	ICreateInfo,
	IDirectoryNewStorageFormat,
	IDirectoryDataObject,
} from "./directory.js";
export type { ISerializableValue } from "./internalInterfaces.js";
export { type IMapOperation, type IMapKeyOperation } from "./mapKernel.js";
export type {
	IMapClearOperation,
	IMapDeleteOperation,
	IMapSetOperation,
} from "./internalInterfaces.js";
