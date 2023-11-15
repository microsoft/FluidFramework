/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Assume } from "../../util";
import { ObjectNodeSchema, TreeNodeSchemaBase } from "../typed-schema";
import { createRawObjectProxy } from "./proxies";
import { ProxyNode, SharedTreeObject } from "./types";

/**
 * Adds a factory function (`create`) to the given schema so that it satisfies the {@link SharedTreeObjectFactory} interface.
 */
export function addFactory<TSchema extends ObjectNodeSchema<string, any>>(
	schema: TSchema,
): FactoryTreeSchema<TSchema> {
	return Object.defineProperty(schema, "create", {
		value: (content: ProxyNode<TSchema, "javaScript">): SharedTreeObject<TSchema> =>
			createRawObjectProxy(schema, content),
		configurable: true,
		enumerable: true,
	}) as FactoryTreeSchema<TSchema>;
}

/**
 * Creates `{@link SharedTreeObject}`s of the given schema type via a `create` method.
 * @alpha
 */
export interface SharedTreeObjectFactory<TSchema extends TreeNodeSchemaBase> {
	/**
	 * Create a {@link SharedTreeObject} that can be inserted into the tree via assignment `=`.
	 * @param content - the data making up the {@link SharedTreeObject} to be created.
	 * @remarks
	 * The {@link SharedTreeObject} created by this function may _only_ be used for insertion into the tree.
	 * It may not be read, mutated or queried in any way.
	 */
	create(
		content: ProxyNode<Assume<TSchema, ObjectNodeSchema>, "javaScript">,
	): SharedTreeObject<Assume<TSchema, ObjectNodeSchema>>;
}

/**
 * A {@link TreeNodeSchema} which is also a {@link SharedTreeObjectFactory}.
 * @alpha
 */
export type FactoryTreeSchema<TSchema extends TreeNodeSchemaBase> = TSchema &
	SharedTreeObjectFactory<TSchema>;
