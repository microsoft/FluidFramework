/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";
import {
	IDisposable,
	IEvent,
	IEventProvider,
	IEventThisPlaceHolder,
} from "@fluidframework/core-interfaces";

/**
 * Type of "valueChanged" event parameter.
 * @sealed
 * @public
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	previousValue: any;
}

/**
 * Interface describing actions on a directory.
 *
 * @remarks When used as a Map, operates on its keys.
 * @alpha
 */
// TODO: Use `unknown` instead (breaking change).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IDirectory
	extends Map<string, any>,
		IEventProvider<IDirectoryEvents>,
		Partial<IDisposable> {
	/**
	 * The absolute path of the directory.
	 */
	readonly absolutePath: string;

	/**
	 * Retrieves the value stored at the given key from the directory.
	 * @param key - Key to retrieve from
	 * @returns The stored value, or undefined if the key is not set
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	get<T = any>(key: string): T | undefined;

	/**
	 * Sets the value stored at key to the provided value.
	 * @param key - Key to set at
	 * @param value - Value to set
	 * @returns The IDirectory itself
	 */
	set<T = unknown>(key: string, value: T): this;

	/**
	 * Get the number of sub directory within the directory.
	 * @returns The number of sub directory within a directory.
	 */
	countSubDirectory?(): number;

	/**
	 * Creates an IDirectory child of this IDirectory, or retrieves the existing IDirectory child if one with the
	 * same name already exists.
	 * @param subdirName - Name of the new child directory to create
	 * @returns The IDirectory child that was created or retrieved
	 */
	createSubDirectory(subdirName: string): IDirectory;

	/**
	 * Gets an IDirectory child of this IDirectory, if it exists.
	 * @param subdirName - Name of the child directory to get
	 * @returns The requested IDirectory
	 */
	getSubDirectory(subdirName: string): IDirectory | undefined;

	/**
	 * Checks whether this directory has a child directory with the given name.
	 * @param subdirName - Name of the child directory to check
	 * @returns True if it exists, false otherwise
	 */
	hasSubDirectory(subdirName: string): boolean;

	/**
	 * Deletes an IDirectory child of this IDirectory, if it exists, along with all descendent keys and directories.
	 * @param subdirName - Name of the child directory to delete
	 * @returns True if the IDirectory existed and was deleted, false if it did not exist
	 */
	deleteSubDirectory(subdirName: string): boolean;

	/**
	 * Gets an iterator over the IDirectory children of this IDirectory.
	 * @returns The IDirectory iterator
	 */
	subdirectories(): IterableIterator<[string, IDirectory]>;

	/**
	 * Get an IDirectory within the directory, in order to use relative paths from that location.
	 * @param relativePath - Path of the IDirectory to get, relative to this IDirectory
	 * @returns The requested IDirectory
	 */
	getWorkingDirectory(relativePath: string): IDirectory | undefined;
}

/**
 * Events emitted in response to changes to the directory data.
 *
 * @remarks
 * These events only emit on the {@link ISharedDirectory} itself, and not on subdirectories.
 * @alpha
 */
export interface ISharedDirectoryEvents extends ISharedObjectEvents {
	/**
	 * Emitted when a key is set or deleted. This is emitted for any key in the {@link ISharedDirectory} or any
	 * subdirectory.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `changed` - Information on the key that changed, its value prior to the change, and the path to the
	 * key that changed.
	 *
	 * - `local` - Whether the change originated from this client.
	 *
	 * - `target` - The {@link ISharedDirectory} itself.
	 */
	(
		event: "valueChanged",
		listener: (
			changed: IDirectoryValueChanged,
			local: boolean,
			target: IEventThisPlaceHolder,
		) => void,
	);

	/**
	 * Emitted when the {@link ISharedDirectory} is cleared.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `local` - Whether the clear originated from this client.
	 *
	 * - `target` - The {@link ISharedDirectory} itself.
	 */
	(event: "clear", listener: (local: boolean, target: IEventThisPlaceHolder) => void);

	/**
	 * Emitted when a subdirectory is created.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `path` - The relative path to the subdirectory that is created.
	 * It is relative from the object which raises the event.
	 *
	 * - `local` - Whether the create originated from the this client.
	 *
	 * - `target` - The {@link ISharedDirectory} itself.
	 */
	(
		event: "subDirectoryCreated",
		listener: (path: string, local: boolean, target: IEventThisPlaceHolder) => void,
	);

	/**
	 * Emitted when a subdirectory is deleted.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `path` - The relative path to the subdirectory that is deleted.
	 * It is relative from the object which raises the event.
	 *
	 * - `local` - Whether the delete originated from the this client.
	 *
	 * - `target` - The {@link ISharedDirectory} itself.
	 */
	(
		event: "subDirectoryDeleted",
		listener: (path: string, local: boolean, target: IEventThisPlaceHolder) => void,
	);
}

/**
 * Events emitted in response to changes to the directory data.
 * @alpha
 */
export interface IDirectoryEvents extends IEvent {
	/**
	 * Emitted when a key is set or deleted. As opposed to the
	 * {@link SharedDirectory}'s valueChanged event, this is emitted only on the {@link IDirectory} that directly
	 * contains the key.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `changed` - Information on the key that changed and its value prior to the change.
	 *
	 * - `local` - Whether the change originated from this client.
	 *
	 * - `target` - The {@link IDirectory} itself.
	 */
	(
		event: "containedValueChanged",
		listener: (changed: IValueChanged, local: boolean, target: IEventThisPlaceHolder) => void,
	);

	/**
	 * Emitted when a subdirectory is created. Also emitted when a delete
	 * of a subdirectory is rolled back.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `path` - The relative path to the subdirectory that is created.
	 * It is relative from the object which raises the event.
	 *
	 * - `local` - Whether the creation originated from the this client.
	 *
	 * - `target` - The {@link ISharedDirectory} itself.
	 */
	(
		event: "subDirectoryCreated",
		listener: (path: string, local: boolean, target: IEventThisPlaceHolder) => void,
	);

	/**
	 * Emitted when a subdirectory is deleted.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `path` - The relative path to the subdirectory that is deleted.
	 * It is relative from the object which raises the event.
	 *
	 * - `local` - Whether the delete originated from the this client.
	 *
	 * - `target` - The {@link ISharedDirectory} itself.
	 */
	(
		event: "subDirectoryDeleted",
		listener: (path: string, local: boolean, target: IEventThisPlaceHolder) => void,
	);

	/**
	 * Emitted when this sub directory is deleted.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `target` - The {@link IDirectory} itself.
	 */
	(event: "disposed", listener: (target: IEventThisPlaceHolder) => void);

	/**
	 * Emitted when this previously deleted sub directory is restored.
	 * This event only needs to be handled in the case of rollback. If your application does
	 * not use the local rollback feature, you can ignore this event.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `target` - The {@link IDirectory} itself.
	 */
	(event: "undisposed", listener: (target: IEventThisPlaceHolder) => void);
}

/**
 * Provides a hierarchical organization of map-like data structures as SubDirectories.
 * The values stored within can be accessed like a map, and the hierarchy can be navigated using path syntax.
 * SubDirectories can be retrieved for use as working directories.
 * @alpha
 */
export interface ISharedDirectory
	extends ISharedObject<ISharedDirectoryEvents & IDirectoryEvents>,
		Omit<IDirectory, "on" | "once" | "off"> {
	// The Omit type excludes symbols, which we don't want to exclude.  Adding them back here manually.
	// https://github.com/microsoft/TypeScript/issues/31671
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[Symbol.iterator](): IterableIterator<[string, any]>;
	readonly [Symbol.toStringTag]: string;
}

/**
 * Type of "valueChanged" event parameter for {@link ISharedDirectory}.
 * @alpha
 */
export interface IDirectoryValueChanged extends IValueChanged {
	/**
	 * The absolute path to the IDirectory storing the key which changed.
	 */
	path: string;
}

/**
 * Events emitted in response to changes to the {@link ISharedMap | map} data.
 * @sealed
 * @public
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
 * @sealed
 * @public
 */
// TODO: Use `unknown` instead (breaking change).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ISharedMap extends ISharedObject<ISharedMapEvents>, Map<string, any> {
	/**
	 * Retrieves the given key from the map if it exists.
	 * @param key - Key to retrieve from
	 * @returns The stored value, or undefined if the key is not set
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	get<T = any>(key: string): T | undefined;

	/**
	 * Sets the value stored at key to the provided value.
	 * @param key - Key to set
	 * @param value - Value to set
	 * @returns The {@link ISharedMap} itself
	 */
	set<T = unknown>(key: string, value: T): this;
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
