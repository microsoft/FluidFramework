/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Assume } from "../../../util";
import { typeNameSymbol } from "../../contextuallyTyped";
import { ObjectNodeSchema, TreeNodeSchema } from "../../typed-schema";
import { ProxyNode, SharedTreeObject } from "./types";

const factoryContent = Symbol("Node content");
interface HasFactoryContent<T> {
	[factoryContent]: T;
}

/**
 * Returns the content stored on an object created by a {@link SharedTreeObjectFactory}.
 */
export function getFactoryContent<TSchema extends ObjectNodeSchema>(
	x: SharedTreeObject<TSchema>,
): ProxyNode<TSchema> | undefined {
	return (x as Partial<HasFactoryContent<ProxyNode<TSchema>>>)[factoryContent];
}

/**
 * Adds a factory function (`create`) to the given schema so that it satisfies the {@link SharedTreeObjectFactory} interface.
 */
export function addFactory<TSchema extends ObjectNodeSchema>(
	schema: TSchema,
): FactoryTreeSchema<TSchema> {
	const create = (content: ProxyNode<TSchema, "javaScript">): SharedTreeObject<TSchema> => {
		const node = Object.create(null);
		// Shallow copy the content and then add the type name symbol to it.
		// The copy is necessary so that the input `content` object can be re-used as the contents of a different typed/named node in another `create` call.
		const namedContent = { ...content, [typeNameSymbol]: schema.name };
		Object.defineProperty(node, factoryContent, { value: namedContent });
		for (const [key] of schema.objectNodeFields) {
			Object.defineProperty(node, key, {
				// TODO: `node` could be made fully readable by recursively constructing/returning objects, maps and lists and values here.
				get: () => factoryObjectError(),
				set: () => factoryObjectError(),
				enumerable: true,
			});
		}
		return node as SharedTreeObject<TSchema>;
	};

	return Object.defineProperty(schema, "create", {
		value: create,
		configurable: true,
		enumerable: true,
	}) as FactoryTreeSchema<TSchema>;
}

/**
 * Creates `{@link SharedTreeObject}`s of the given schema type via a `create` method.
 * @alpha
 */
export interface SharedTreeObjectFactory<TSchema extends TreeNodeSchema<string, unknown>> {
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
export type FactoryTreeSchema<TSchema extends TreeNodeSchema<string, unknown>> = TSchema &
	SharedTreeObjectFactory<TSchema>;

function factoryObjectError(): never {
	throw new Error(factoryObjectErrorMessage);
}

export const factoryObjectErrorMessage =
	"Newly created node must be inserted into the tree before being queried";
