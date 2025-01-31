/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import type {
// 	IChannelAttributes,
// 	IFluidDataStoreRuntime,
// } from "@fluidframework/datastore-definitions/internal";
// import { SharedObjectFromKernel } from "@fluidframework/shared-object-base/internal";

// import type { ISharedMap, ISharedMapEvents } from "./interfaces.js";
// import { MapKernel } from "./mapKernel.js";

// /**
//  * {@inheritDoc ISharedMap}
//  */
// export class SharedMap extends SharedObjectFromKernel<ISharedMapEvents> implements ISharedMap {
// 	/**
// 	 * String representation for the class.
// 	 */
// 	public readonly [Symbol.toStringTag]: string = "SharedMap";

// 	/**
// 	 * MapKernel which manages actual map operations.
// 	 */
// 	protected readonly kernel: MapKernel;

// 	/**
// 	 * Do not call the constructor. Instead, you should use the {@link SharedMap.create | create method}.
// 	 *
// 	 * @param id - String identifier.
// 	 * @param runtime - Data store runtime.
// 	 * @param attributes - The attributes for the map.
// 	 */
// 	public constructor(
// 		id: string,
// 		runtime: IFluidDataStoreRuntime,
// 		attributes: IChannelAttributes,
// 	) {
// 		super(id, runtime, attributes, "fluid_map_");
// 		this.kernel = new MapKernel(
// 			this.serializer,
// 			this.handle,
// 			(op, localOpMetadata) => this.submitLocalMessage(op, localOpMetadata),
// 			() => this.isAttached(),
// 			this,
// 		);
// 	}

// 	/**
// 	 * Get an iterator over the keys in this map.
// 	 * @returns The iterator
// 	 */
// 	public keys(): IterableIterator<string> {
// 		return this.kernel.keys();
// 	}

// 	/**
// 	 * Get an iterator over the entries in this map.
// 	 * @returns The iterator
// 	 */
// 	// TODO: Use `unknown` instead (breaking change).
// 	// eslint-disable-next-line @typescript-eslint/no-explicit-any
// 	public entries(): IterableIterator<[string, any]> {
// 		return this.kernel.entries();
// 	}

// 	/**
// 	 * Get an iterator over the values in this map.
// 	 * @returns The iterator
// 	 */
// 	// TODO: Use `unknown` instead (breaking change).
// 	// eslint-disable-next-line @typescript-eslint/no-explicit-any
// 	public values(): IterableIterator<any> {
// 		return this.kernel.values();
// 	}

// 	/**
// 	 * Get an iterator over the entries in this map.
// 	 * @returns The iterator
// 	 */
// 	// TODO: Use `unknown` instead (breaking change).
// 	// eslint-disable-next-line @typescript-eslint/no-explicit-any
// 	public [Symbol.iterator](): IterableIterator<[string, any]> {
// 		return this.kernel.entries();
// 	}

// 	/**
// 	 * The number of key/value pairs stored in the map.
// 	 */
// 	public get size(): number {
// 		return this.kernel.size;
// 	}

// 	/**
// 	 * Executes the given callback on each entry in the map.
// 	 * @param callbackFn - Callback function
// 	 */
// 	// TODO: Use `unknown` instead (breaking change).
// 	// eslint-disable-next-line @typescript-eslint/no-explicit-any
// 	public forEach(callbackFn: (value: any, key: string, map: Map<string, any>) => void): void {
// 		// eslint-disable-next-line unicorn/no-array-for-each, unicorn/no-array-callback-reference
// 		this.kernel.forEach(callbackFn);
// 	}

// 	/**
// 	 * {@inheritDoc ISharedMap.get}
// 	 */
// 	// TODO: Use `unknown` instead (breaking change).
// 	// eslint-disable-next-line @typescript-eslint/no-explicit-any
// 	public get<T = any>(key: string): T | undefined {
// 		return this.kernel.get<T>(key);
// 	}

// 	/**
// 	 * Check if a key exists in the map.
// 	 * @param key - The key to check
// 	 * @returns True if the key exists, false otherwise
// 	 */
// 	public has(key: string): boolean {
// 		return this.kernel.has(key);
// 	}

// 	/**
// 	 * {@inheritDoc ISharedMap.set}
// 	 */
// 	public set(key: string, value: unknown): this {
// 		this.kernel.set(key, value);
// 		return this;
// 	}

// 	/**
// 	 * Delete a key from the map.
// 	 * @param key - Key to delete
// 	 * @returns True if the key existed and was deleted, false if it did not exist
// 	 */
// 	public delete(key: string): boolean {
// 		return this.kernel.delete(key);
// 	}

// 	/**
// 	 * Clear all data from the map.
// 	 */
// 	public clear(): void {
// 		this.kernel.clear();
// 	}
// }
