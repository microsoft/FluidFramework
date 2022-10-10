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

export {
    IValueChanged,
    IDirectory,
    ISharedDirectoryEvents,
    IDirectoryEvents,
    ISharedDirectory,
    IDirectoryValueChanged,
    ISharedMapEvents,
    ISharedMap,
    ISerializableValue,
    ISerializedValue,
} from "./interfaces";
export { MapFactory, SharedMap } from "./map";
export {
    IDirectorySetOperation,
    IDirectoryDeleteOperation,
    IDirectoryKeyOperation,
    IDirectoryClearOperation,
    IDirectoryStorageOperation,
    IDirectoryCreateSubDirectoryOperation,
    IDirectoryDeleteSubDirectoryOperation,
    IDirectorySubDirectoryOperation,
    IDirectoryOperation,
    IDirectoryDataObject,
    IDirectoryNewStorageFormat,
    DirectoryFactory,
    SharedDirectory,
} from "./directory";
export { LocalValueMaker, ILocalValue } from "./localValues";
