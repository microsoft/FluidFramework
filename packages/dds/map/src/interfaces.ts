/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDisposable,
	IEvent,
	IEventProvider,
	IEventThisPlaceHolder,
} from "@fluidframework/core-interfaces";
import type {
	ISharedObject,
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";

/**
 * Type of "valueChanged" event parameter.
 * @sealed
 * @legacy
 * @public
 */
export interface IValueChanged {
	/**
	 * The key storing the value that changed.
	 */
	readonly key: string;

	/**
	 * The value that was stored at the key prior to the change.
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly previousValue: any;
}

/**
 * Type of "sortKeyChanged" event parameter.
 * @sealed
 * @legacy
 * @public
 */
export interface ISortKeyChanged {
	/**
	 * The key whose sort key changed.
	 */
	readonly key: string;

	/**
	 * The new sort key, or `undefined` if the sort key was cleared.
	 */
	readonly sortKey: string | undefined;

	/**
	 * The sort key prior to the change, or `undefined` if none had been set.
	 */
	readonly previousSortKey: string | undefined;
}

/**
 * Type of "sortKeyChanged" event parameter for {@link ISharedDirectory}.
 * @sealed
 * @legacy
 * @public
 */
export interface IDirectorySortKeyChanged extends ISortKeyChanged {
	/**
	 * The absolute path to the IDirectory whose sort key changed.
	 */
	readonly path: string;
}

/**
 * Type of "subDirectorySortKeyChanged" event parameter.
 * @sealed
 * @legacy
 * @public
 */
export interface ISubDirectorySortKeyChanged {
	/**
	 * The name of the child subdirectory whose sort key changed (relative to the parent).
	 */
	readonly subdirName: string;

	/**
	 * The new sort key, or `undefined` if the sort key was cleared.
	 */
	readonly sortKey: string | undefined;

	/**
	 * The sort key prior to the change, or `undefined` if none had been set.
	 */
	readonly previousSortKey: string | undefined;
}

/**
 * Type of "subDirectorySortKeyChanged" event parameter for {@link ISharedDirectory}.
 * @sealed
 * @legacy
 * @public
 */
export interface IDirectorySubDirectorySortKeyChanged extends ISubDirectorySortKeyChanged {
	/**
	 * The absolute path to the parent IDirectory whose child's sort key changed.
	 */
	readonly path: string;
}

/**
 * Interface describing actions on a directory.
 *
 * @remarks When used as a Map, operates on its keys.
 * @sealed
 * @legacy
 * @public
 */
export interface IDirectory
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

	/**
	 * Sets (or clears, when `sortKey` is `undefined`) the sort key associated with a key in this directory.
	 * Sort keys control the iteration order produced by
	 * {@link IDirectory.keysByOrder}, {@link IDirectory.valuesByOrder}, and {@link IDirectory.entriesByOrder}.
	 * The sort key is independent of the key's value; it is preserved across updates to the value and exists
	 * only as long as the key itself exists (it is cleared when the key is deleted or the directory is cleared).
	 * @param key - Key whose sort key is being set
	 * @param sortKey - New sort key; `undefined` clears it
	 */
	setSortKey(key: string, sortKey: string | undefined): void;

	/**
	 * Sets (or clears, when `sortKey` is `undefined`) the sort key associated with a child subdirectory.
	 * Sort keys control the iteration order produced by {@link IDirectory.subdirectoriesByOrder}.
	 * @param subdirName - Name of the child subdirectory whose sort key is being set
	 * @param sortKey - New sort key; `undefined` clears it
	 */
	setSubDirectorySortKey(subdirName: string, sortKey: string | undefined): void;

	/**
	 * Get an iterator over the keys under this IDirectory in sort-key order.
	 *
	 * @remarks Entries that have a sort key set appear first, in lexicographic (JavaScript `<`) order of
	 * their sort keys, with ties broken by the default iteration order. Entries without a sort key follow,
	 * in the default iteration order.
	 * @returns The iterator
	 */
	keysByOrder(): IterableIterator<string>;

	/**
	 * Get an iterator over the values under this IDirectory in sort-key order.
	 * @returns The iterator
	 * @see {@link IDirectory.keysByOrder}
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	valuesByOrder(): IterableIterator<any>;

	/**
	 * Get an iterator over the entries under this IDirectory in sort-key order.
	 * @returns The iterator
	 * @see {@link IDirectory.keysByOrder}
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	entriesByOrder(): IterableIterator<[string, any]>;

	/**
	 * Get an iterator over the child subdirectories in subdirectory-sort-key order.
	 *
	 * @remarks Subdirectories that have a sort key set appear first, in lexicographic order of their sort keys,
	 * with ties broken by the default subdirectory iteration order. Subdirectories without a sort key follow,
	 * in the default iteration order ({@link IDirectory.subdirectories}).
	 * @returns The iterator
	 */
	subdirectoriesByOrder(): IterableIterator<[string, IDirectory]>;
}

/**
 * Events emitted in response to changes to the directory data.
 *
 * @remarks
 * These events only emit on the {@link ISharedDirectory} itself, and not on subdirectories.
 * @sealed
 * @legacy @beta
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
	 * @deprecated Use the "cleared" event instead which provides the path that was cleared.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `local` - Whether the clear originated from this client.
	 *
	 * - `target` - The {@link ISharedDirectory} itself.
	 */
	(event: "clear", listener: (local: boolean, target: IEventThisPlaceHolder) => void);

	/**
	 * Emitted when the {@link ISharedDirectory} is cleared.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `path` - The absolute path to the directory that was cleared.
	 *
	 * - `local` - Whether the clear originated from this client.
	 *
	 * - `target` - The {@link ISharedDirectory} itself.
	 */
	(
		event: "cleared",
		listener: (path: string, local: boolean, target: IEventThisPlaceHolder) => void,
	);

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

	/**
	 * Emitted when a key's sort key is set, updated, or cleared anywhere in the directory tree.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `changed` - Information on the key whose sort key changed, its prior sort key, and the path to the
	 * directory containing the key.
	 *
	 * - `local` - Whether the change originated from this client.
	 *
	 * - `target` - The {@link ISharedDirectory} itself.
	 *
	 * This event does not fire when the key itself is deleted or the directory is cleared — the sort key is
	 * implicitly removed in those cases.
	 */
	(
		event: "sortKeyChanged",
		listener: (
			changed: IDirectorySortKeyChanged,
			local: boolean,
			target: IEventThisPlaceHolder,
		) => void,
	);

	/**
	 * Emitted when a child subdirectory's sort key is set, updated, or cleared anywhere in the directory tree.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `changed` - Information on the subdirectory whose sort key changed, its prior sort key, and the path
	 * to the parent directory.
	 *
	 * - `local` - Whether the change originated from this client.
	 *
	 * - `target` - The {@link ISharedDirectory} itself.
	 */
	(
		event: "subDirectorySortKeyChanged",
		listener: (
			changed: IDirectorySubDirectorySortKeyChanged,
			local: boolean,
			target: IEventThisPlaceHolder,
		) => void,
	);
}

/**
 * Events emitted in response to changes to the directory data.
 * @sealed
 * @legacy
 * @public
 */
export interface IDirectoryEvents extends IEvent {
	/**
	 * Emitted when a key is set or deleted. As opposed to the
	 * {@link ISharedDirectory}'s valueChanged event, this is emitted only on the {@link IDirectory} that directly
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

	/**
	 * Emitted when a key's sort key is set, updated, or cleared within this {@link IDirectory}. As opposed to
	 * the {@link ISharedDirectory}'s sortKeyChanged event, this is emitted only on the directory that directly
	 * contains the key.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `changed` - Information on the key whose sort key changed and its prior sort key.
	 *
	 * - `local` - Whether the change originated from this client.
	 *
	 * - `target` - The {@link IDirectory} itself.
	 *
	 * This event does not fire when the key itself is deleted or the directory is cleared — the sort key is
	 * implicitly removed in those cases.
	 */
	(
		event: "containedSortKeyChanged",
		listener: (
			changed: ISortKeyChanged,
			local: boolean,
			target: IEventThisPlaceHolder,
		) => void,
	);

	/**
	 * Emitted when a child subdirectory's sort key is set, updated, or cleared. As opposed to the
	 * {@link ISharedDirectory}'s subDirectorySortKeyChanged event, this is emitted only on the parent directory
	 * that directly contains the child subdirectory.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `changed` - Information on the subdirectory whose sort key changed and its prior sort key.
	 *
	 * - `local` - Whether the change originated from this client.
	 *
	 * - `target` - The {@link IDirectory} itself.
	 */
	(
		event: "containedSubDirectorySortKeyChanged",
		listener: (
			changed: ISubDirectorySortKeyChanged,
			local: boolean,
			target: IEventThisPlaceHolder,
		) => void,
	);
}

/**
 * Provides a hierarchical organization of map-like data structures as SubDirectories.
 * The values stored within can be accessed like a map, and the hierarchy can be navigated using path syntax.
 * SubDirectories can be retrieved for use as working directories.
 * @sealed
 * @legacy @beta
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
 * @sealed
 * @legacy
 * @public
 */
export interface IDirectoryValueChanged extends IValueChanged {
	/**
	 * The absolute path to the IDirectory storing the key which changed.
	 * @readonly
	 * @privateRemarks
	 * When breaking changes can be made, `readonly` should be added.
	 */
	path: string;
}

/**
 * Events emitted in response to changes to the {@link ISharedMap | map} data.
 * @sealed
 * @legacy @beta
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
 * @sealed
 * @legacy @beta
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
