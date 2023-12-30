/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Serializable } from "@fluidframework/datastore-definitions";

/**
 * @alpha
 */
export type ClientId = string;

/**
 * @alpha
 */
// TODO: RoundTrippable needs revised to be the consistent pre and post serialization
//       and get a better name.
export type RoundTrippable<T> = Serializable<T>;

/**
 * Brand to ensure independent values internal type safety without revealing
 * internals that are subject to change.
 *
 * @alpha
 */
export declare class IndependentValueBrand<T> {
	private readonly IndependentValue: IndependentValue<T>;
}

/**
 * This type provides no additional functionality over the type it wraps.
 * It is used to ensure type safety within package.
 * Users may find it convenient to just use the type it wraps directly.
 *
 * @privateRemarks
 * Checkout filtering omitting unknown from T (`Omit<T,unknown> &`).
 *
 * @alpha
 */
export type IndependentValue<T> = T & IndependentValueBrand<T>;

/**
 * @alpha
 */
export declare class IndependentDatastoreHandle<TPath, TValue> {
	private readonly IndependentDirectoryHandle: IndependentDatastoreHandle<TPath, TValue>;
}

/**
 * Package internal function declaration for value manager instantiation.
 * @alpha
 */
export type ManagerFactory<TPath extends string, TValue, TManager> = (
	path: TPath,
	datastoreHandle: IndependentDatastoreHandle<TPath, TValue>,
) => {
	value: RoundTrippable<TValue>;
	manager: IndependentValue<TManager>;
};

/**
 * @alpha
 */
export type IndependentDirectoryNode<
	TPath extends string,
	TValue = RoundTrippable<unknown>,
	TManager = unknown,
> = ManagerFactory<TPath, TValue, TManager>;

/**
 * @alpha
 */
export interface IndependentDirectoryNodeSchema {
	// [path: string]: <T, M>(initialValue: Serializable<M>) => IndependentDirectoryNode<IndependentValue<T>>;
	// inference gobbledegook with no basis to work
	// [Path: string]: <P1 extends string, P2,R>(a: P1, b: P2) => R extends ManagerFactory<typeof Path, infer TValue, infer TManager> ? ManagerFactory<typeof Path, TValue, TManager> : never;
	// Comes super close to working, but the instantiation is not viable as factory can be invoked with arbitrary TValue and TManager.
	// [Path: string]: <TPath extends typeof Path & string, TValue, TManager>(
	// 	path: TPath,
	// 	datastoreHandle: IndependentDatastoreHandle<TPath, TValue>,
	// ) => {
	// 	value: RoundTrippable<TValue>;
	// 	manager: IndependentValue<TManager>;
	// };
	// Defaults don't help
	// [Path: string]: <TValue = unknown, TManager = unknown>(
	// 	path: typeof Path,
	// 	datastoreHandle: IndependentDatastoreHandle<typeof Path, TValue>,
	// ) => {
	// 	value: RoundTrippable<TValue>;
	// 	manager: IndependentValue<TManager>;
	// };
	[path: string]: IndependentDirectoryNode<typeof path>;
}

/**
 * @alpha
 */
export type IndependentDirectoryPaths<TSchema extends IndependentDirectoryNodeSchema> = {
	readonly [path in Exclude<
		keyof TSchema,
		keyof IndependentDirectoryMethods<TSchema>
	>]: ReturnType<TSchema[path]>["manager"];
};

/**
 * @alpha
 */
export interface IndependentDirectoryMethods<TSchema extends IndependentDirectoryNodeSchema> {
	add<TPath extends string, TValue, TManager>(
		path: TPath,
		manager: ManagerFactory<TPath, TValue, TManager>,
	): asserts this is IndependentDirectory<
		TSchema & Record<TPath, ManagerFactory<TPath, TValue, TManager>>
	>;
}

/**
 * @alpha
 */
export type IndependentDirectory<TSchema extends IndependentDirectoryNodeSchema> =
	IndependentDirectoryPaths<TSchema> & IndependentDirectoryMethods<TSchema>;
