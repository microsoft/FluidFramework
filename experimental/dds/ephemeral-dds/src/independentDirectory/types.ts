/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IndependentValueManager } from "../independentValueManager";

export type IndependentDirectoryNode<
	T extends IndependentValueManager<unknown> = IndependentValueManager<unknown>,
> = T;

export interface IndependentDirectoryNodeSchema {
	[path: string]: IndependentDirectoryNode;
}

// const empty = {};
// type EmptyIndependentDirectoryNodeSchema = typeof empty;

export type IndependentDirectoryPaths<T extends IndependentDirectoryNodeSchema> = {
	readonly [path in Exclude<keyof T, keyof IndependentDirectoryMethods<T>>]: T[path];
};

export interface IndependentDirectoryMethods<T extends IndependentDirectoryNodeSchema> {
	add<TPath extends string, TNode extends IndependentDirectoryNode>(
		path: TPath,
		node: TNode,
	): asserts this is IndependentDirectory<T & Record<TPath, TNode>>;
}

export type IndependentDirectory<T extends IndependentDirectoryNodeSchema> =
	IndependentDirectoryPaths<T> & IndependentDirectoryMethods<T>;
