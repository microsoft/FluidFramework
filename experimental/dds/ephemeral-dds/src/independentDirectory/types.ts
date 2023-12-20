/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Serializable } from "@fluidframework/datastore-definitions";
import type { IndependentValue } from "../independentValue";

/**
 * @alpha
 */
export type ClientId = string;

/**
 * @alpha
 */
export type IndependentDirectoryNode<T = IndependentValue<unknown>> = T extends IndependentValue<
	infer U
>
	? T
	: never;

/**
 * @alpha
 */
export interface IndependentDirectoryNodeSchema {
	// TODO: replace IndependentDirectoryNode with factory function as well as lookups to get the return type
	[path: string]: IndependentDirectoryNode; // <T, M>(initialValue: Serializable<M>) => IndependentDirectoryNode<IndependentValue<T>>;
}

/**
 * @internal
 */
export interface IndependentDatastore<
	T extends IndependentDirectoryNodeSchema,
	Path extends keyof T & string = keyof T & string,
> {
	localUpdate(path: Path, forceBroadcast: boolean): void;
	update(path: Path, clientId: ClientId, rev: number, value: RoundTrippable<T[Path]>): void;
	knownValues(path: Path): { self: ClientId | undefined; states: ValueElement<T[Path]> };
}

/**
 * @alpha
 */
export type IndependentDirectoryPaths<T extends IndependentDirectoryNodeSchema> = {
	readonly [path in Exclude<keyof T, keyof IndependentDirectoryMethods<T>>]: T[path];
};

/**
 * @alpha
 */
export interface IndependentDirectoryMethods<T extends IndependentDirectoryNodeSchema> {
	add<TPath extends string, TNode extends IndependentDirectoryNode>(
		path: TPath,
		node: TNode,
	): asserts this is IndependentDirectory<T & Record<TPath, TNode>>;
}

/**
 * @alpha
 */
export type IndependentDirectory<T extends IndependentDirectoryNodeSchema> =
	IndependentDirectoryPaths<T> & IndependentDirectoryMethods<T>;

/**
 * @alpha
 */
// TODO: RoundTrippable needs revised to be the consistent pre and post serialization
//       and get a better name.
export type RoundTrippable<T> = Serializable<T>;

/**
 * @internal
 */
export interface ValueState<TValue> {
	rev: number;
	value: RoundTrippable<TValue>;
}

/**
 * @internal
 */
export interface ValueElement<TValue> {
	[id: string]: ValueState<TValue>;
}

/**
 * @internal
 */
export interface ValueElementDirectory<TValue> {
	[id: string]: { [clientId: ClientId]: ValueState<TValue> };
}

/**
 * @internal
 */
export interface ValueManager<TValue> {
	get value(): ValueState<TValue>;
	update(clientId: ClientId, rev: number, value: RoundTrippable<TValue>): void;
}
