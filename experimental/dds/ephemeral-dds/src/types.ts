/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Serializable } from "@fluidframework/datastore-definitions";

import type { IndependentDatastoreHandle } from "./independentDatastore.js";
import type { IndependentValue } from "./independentValue.js";

/**
 * @alpha
 */
export type ClientId = string;

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

/**
 * @alpha
 */
// TODO: RoundTrippable needs revised to be the consistent pre and post serialization
//       and get a better name.
export type RoundTrippable<T> = Serializable<T>;
