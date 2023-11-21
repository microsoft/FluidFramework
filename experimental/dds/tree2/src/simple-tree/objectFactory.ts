/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Assume } from "../util";
import { ObjectNodeSchema, TreeNodeSchemaBase } from "../feature-libraries";
import { createRawObjectProxy } from "./proxies";
import { TreeObjectNode } from "./types";
import { InsertableTypedNode } from "./insertable";

/**
 * Adds a factory function (`create`) to the given schema so that it satisfies the {@link TreeObjectFactory} interface.
 */
export function addFactory<TSchema extends ObjectNodeSchema<string, any>>(
	schema: TSchema,
): FactoryTreeSchema<TSchema> {
	return Object.defineProperty(schema, "create", {
		value: (content: InsertableTypedNode<TSchema>): TreeObjectNode<TSchema> =>
			createRawObjectProxy(schema, content),
		configurable: true,
		enumerable: true,
	}) as FactoryTreeSchema<TSchema>;
}

/**
 * Creates `{@link TreeObjectNode}`s of the given schema type via a `create` method.
 * @alpha
 */
export interface TreeObjectFactory<TSchema extends TreeNodeSchemaBase> {
	/**
	 * Create a {@link TreeObjectNode} that can be inserted into the tree via assignment `=`.
	 * @param content - the data making up the {@link TreeObjectNode} to be created.
	 * @remarks
	 * The {@link TreeObjectNode} created by this function may _only_ be used for insertion into the tree.
	 * It may not be read, mutated or queried in any way.
	 */
	create(
		content: InsertableTypedNode<Assume<TSchema, ObjectNodeSchema>>,
	): TreeObjectNode<Assume<TSchema, ObjectNodeSchema>>;
}

/**
 * A {@link TreeNodeSchema} which is also a {@link TreeObjectFactory}.
 * @alpha
 */
export type FactoryTreeSchema<TSchema extends TreeNodeSchemaBase> = TSchema &
	TreeObjectFactory<TSchema>;
