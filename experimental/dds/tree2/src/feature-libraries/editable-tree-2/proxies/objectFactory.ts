/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Assume, fail } from "../../../util";
import { typeNameSymbol } from "../../contextuallyTyped";
import { ObjectNodeSchema, TreeNodeSchema } from "../../typed-schema";
import { ProxyNode, SharedTreeObject } from "./types";

const factoryContentSymbol = Symbol("Node content");
interface HasFactoryContent<T> {
	[factoryContentSymbol]: T;
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
		const contentCopy = { ...content };
		// Add the symbol as a non-enumerable property to keep it hidden.
		Object.defineProperty(contentCopy, typeNameSymbol, { value: schema.name });
		Object.defineProperty(node, factoryContentSymbol, { value: contentCopy });
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
 * Given a content tree that is to be inserted into the shared tree, replace all subtrees that were created by factories
 * (via {@link SharedTreeObjectFactory.create}) with the content that was passed to those factories.
 * @remarks
 * This functions works recursively.
 * Factory-created objects that are nested inside of the content passed to other factory-created objects, and so on, will be in-lined.
 * This function also adds the hidden {@link typeNameSymbol} of each object schema to the output.
 * @example
 * ```ts
 * const x = foo.create({
 *   a: 3, b: bar.create({
 *     c: [baz.create({ d: 5 })]
 *   })
 * });
 * const y = extractFactoryContent(y);
 * y === {
 *   [typeNameSymbol]: "foo", a: 3, b: {
 *     [typeNameSymbol]: "bar", c: [{ [typeNameSymbol]: "baz", d: 5 }]
 *  }
 * }
 * ```
 */
export function extractFactoryContent<T extends ProxyNode<TreeNodeSchema, "javaScript">>(
	content: T,
): T {
	if (Array.isArray(content)) {
		// `content` is an array
		return content.map(extractFactoryContent) as T;
	} else if (content instanceof Map) {
		// `content` is a map
		const map = new Map();
		for (const [k, v] of content) {
			map.set(k, extractFactoryContent(v));
		}
		return map as T;
	} else if (content !== null && typeof content === "object") {
		const copy: Record<string, unknown> = {};
		const factoryContent = (content as Partial<HasFactoryContent<object>>)[
			factoryContentSymbol
		];
		if (factoryContent !== undefined) {
			// `content` is a factory-created object
			const typeName =
				(factoryContent as { [typeNameSymbol]?: string })[typeNameSymbol] ??
				fail("Expected schema type name to be set on factory object content");

			// Copy the type name from the factory content to the output object.
			// This ensures that all objects from factories can be checked for their nominal type if necessary.
			Object.defineProperty(copy, typeNameSymbol, { value: typeName });
			for (const [p, v] of Object.entries(factoryContent)) {
				copy[p] = extractFactoryContent(v);
			}
		} else {
			// `content` is a plain javascript object (but may have factory-created objects within it)
			for (const [p, v] of Object.entries(content)) {
				copy[p] = extractFactoryContent(v);
			}
		}
		return copy as T;
	} else {
		// `content` is a primitive
		return content;
	}
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
