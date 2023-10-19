/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Assume, RestrictiveReadonlyRecord, transformObjectMap } from "../../../util";
import { typeNameSymbol } from "../../contextuallyTyped";
import { FieldKind } from "../../modular-schema";
import { ImplicitFieldSchema, NormalizeField, SchemaBuilderBase } from "../../schemaBuilderBase";
import {
	FieldSchema,
	InternalTypedSchemaTypes,
	StructSchema,
	TreeNodeSchema,
	Unenforced,
} from "../../typed-schema";
import { ProxyNode, SharedTreeObject } from "./types";

const factoryContent = Symbol("Node content");
interface HasFactoryContent<T> {
	[factoryContent]: T;
}

/**
 * Returns the content stored on an object created by a {@link SharedTreeObjectFactory}.
 */
export function getFactoryContent(x: unknown): unknown | undefined {
	return (x as Partial<HasFactoryContent<unknown>>)[factoryContent];
}

/**
 * Creates `{@link SharedTreeObject}`s of some type via a `create` method.
 * @alpha
 */
export interface SharedTreeObjectFactory<TSchema extends TreeNodeSchema<any, any>> {
	/**
	 * Create a {@link SharedTreeObject} that can be inserted into the tree via assignment `=`.
	 * @param content - the data making up the {@link SharedTreeObject} to be created.
	 * @remarks
	 * The {@link SharedTreeObject} created by this function may _only_ be used for insertion into the tree.
	 * It may not be read, mutated or queried in any way.
	 */
	create(
		content: ProxyNode<Assume<TSchema, StructSchema>, "javaScript">,
	): SharedTreeObject<Assume<TSchema, StructSchema>>;
}

class FactoryTreeNodeSchema<
		Name extends string = string,
		T extends
			Unenforced<InternalTypedSchemaTypes.TreeSchemaSpecification> = InternalTypedSchemaTypes.TreeSchemaSpecification,
	>
	extends TreeNodeSchema<Name, T>
	implements SharedTreeObjectFactory<TreeNodeSchema<Name, T>>
{
	public create(
		content: ProxyNode<Assume<TreeNodeSchema<Name, T>, StructSchema>, "javaScript">,
	): SharedTreeObject<Assume<TreeNodeSchema<Name, T>, StructSchema>> {
		const node = {};
		// Shallow copy the content and then add the type name symbol to it.
		// The copy is necessary so that the input `content` object can be re-used as the contents of a different typed/named node in another `create` call.
		const namedContent = { ...content, [typeNameSymbol]: this.name };
		Object.defineProperty(node, factoryContent, { value: namedContent });
		for (const [key] of this.structFields) {
			Object.defineProperty(node, key, {
				// TODO: `node` could be made fully readable by recursively constructing/returning objects, maps and lists and values here.
				get: () => factoryObjectError(),
				set: () => factoryObjectError(),
				enumerable: true,
			});
		}
		return node as SharedTreeObject<Assume<TreeNodeSchema<Name, T>, StructSchema>>;
	}
}

/**
 * An implementation of {@link SchemaBuilderBase} which builds struct schema that also satisfy {@link SharedTreeObjectFactory}.
 * @alpha
 */
export class StructFactorySchemaBuilder<
	TScope extends string,
	TDefaultKind extends FieldKind,
	TName extends number | string = string,
> extends SchemaBuilderBase<TScope, TDefaultKind, TName> {
	public override struct<
		const Name extends TName,
		const T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
	>(name: Name, t: T): TreeNodeSchemaWithObjectFactory<`${TScope}.${Name}`, TDefaultKind, T> {
		const schema = new FactoryTreeNodeSchema(this, this.scoped(name), {
			structFields: transformObjectMap(
				t,
				(field): FieldSchema => this.normalizeField(field),
			) as {
				[key in keyof T]: NormalizeField<T[key], TDefaultKind>;
			},
		});
		this.addNodeSchema(schema as TreeNodeSchema);
		// TODO: It's not clear why this cast is necessary. I'd expect `schema` to satisfy the return type without coercion.
		return schema as TreeNodeSchemaWithObjectFactory<`${TScope}.${Name}`, TDefaultKind, T>;
	}
}

/**
 * A {@link TreeNodeSchema} for a tree object which is also a {@link SharedTreeObjectFactory} that can create insertable tree objects of its type.
 * @alpha
 */
export type TreeNodeSchemaWithObjectFactory<
	Name extends string,
	TDefaultKind extends FieldKind,
	T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
> = TreeNodeSchema<
	Name,
	{ structFields: { [key in keyof T]: NormalizeField<T[key], TDefaultKind> } }
> &
	SharedTreeObjectFactory<
		TreeNodeSchema<
			Name,
			{ structFields: { [key in keyof T]: NormalizeField<T[key], TDefaultKind> } }
		>
	>;

function factoryObjectError(): never {
	throw new Error(factoryObjectErrorMessage);
}

export const factoryObjectErrorMessage =
	"Newly created node must be inserted into the tree before being queried";
