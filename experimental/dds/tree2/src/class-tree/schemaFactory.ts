/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	RestrictiveReadonlyRecord,
	fail,
	getOrCreate,
	isReadonlyArray,
	requireAssignableTo,
} from "../util";
import {
	FlexTreeNode,
	LeafNodeSchema as FlexLeafNodeSchema,
	isFlexTreeNode,
	ObjectNodeSchema,
	isLazy,
	markEager,
} from "../feature-libraries";
import { leaf } from "../domains";
import { TreeValue } from "../core";
import { TreeMapNodeBase } from "../simple-tree";
// eslint-disable-next-line import/no-internal-modules
import { createNodeProxy, createRawObjectProxy, getClassSchema } from "../simple-tree/proxies";
import { getFlexSchema, setFlexSchemaFromClassSchema } from "./toFlexSchema";
import {
	AllowedTypes,
	FieldKind,
	FieldSchema,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	InsertableObjectFromSchemaRecord,
	InsertableTreeNodeFromImplicitAllowedTypes,
	InsertableTypedNode,
	NodeBase,
	NodeFromSchema,
	NodeKind,
	ObjectFromSchemaRecord,
	TreeListNode,
	TreeNodeFromImplicitAllowedTypes,
	TreeNodeSchema,
	TreeNodeSchemaClass,
	TreeNodeSchemaNonClass,
} from "./schemaTypes";

/**
 * Instances of this class are schema for leaf nodes.
 */
export class LeafNodeSchema<T extends FlexLeafNodeSchema>
	implements
		TreeNodeSchemaNonClass<T["name"], NodeKind.Leaf, T["leafValue"], TreeValue<T["info"]>>
{
	public readonly identifier: T["name"];
	public readonly kind = NodeKind.Leaf;
	public readonly info: T["info"];
	public create(data: TreeValue<T["info"]>): TreeValue<T["info"]> {
		return data;
	}

	public constructor(schema: T) {
		setFlexSchemaFromClassSchema(this, schema);
		this.identifier = schema.name;
		this.info = schema.info;
	}
}

function makeLeaf<T extends FlexLeafNodeSchema>(
	schema: T,
): TreeNodeSchema<T["name"], NodeKind.Leaf, T["leafValue"], TreeValue<T["info"]>> {
	return new LeafNodeSchema(schema);
}

/**
 * Builds schema libraries, and the schema within them.
 * @sealed @alpha
 */
export class SchemaFactory<TScope extends string, TName extends number | string = string> {
	private readonly structuralTypes: Map<string, TreeNodeSchema> = new Map();

	public constructor(public readonly scope: TScope) {}

	private scoped<Name extends TName | string>(name: Name): `${TScope}.${Name}` {
		return `${this.scope}.${name}`;
	}

	public readonly string = makeLeaf(leaf.string);
	public readonly number = makeLeaf(leaf.number);
	public readonly boolean = makeLeaf(leaf.boolean);
	public readonly null = makeLeaf(leaf.null);
	public readonly handle = makeLeaf(leaf.handle);

	private nodeSchema<Name extends TName | string, TKind extends NodeKind, T>(
		name: Name,
		kind: TKind,
		t: T,
	) {
		const identifier = this.scoped(name);
		class schema extends NodeBase {
			public static readonly identifier = identifier;
			public static readonly kind = kind;
			public static readonly info = t;
			public constructor(input: FlexTreeNode | unknown) {
				super();
				// Currently this just does validation. All other logic is in the subclass.
				if (isFlexTreeNode(input)) {
					assert(
						getClassSchema(input.schema) === this.constructor,
						"building node with wrong schema",
					);
				}
				// TODO: make this a better user facing error, and explain how to copy explicitly.
				assert(
					!(input instanceof NodeBase),
					"Existing nodes cannot be used as new content to insert. They must either be moved or explicitly copied",
				);
			}
		}
		{
			type _check = requireAssignableTo<
				typeof schema,
				TreeNodeSchema<`${TScope}.${Name}`, TKind, T>
			>;
		}
		markEager(schema);
		return schema;
	}

	/**
	 * Define a {@link TreeNodeSchema} for an object node.
	 *
	 * The name must be unique among all TreeSchema in the the document schema.
	 */
	public object<
		const Name extends TName,
		const T extends RestrictiveReadonlyRecord<string, ImplicitFieldSchema>,
	>(
		name: Name,
		t: T,
	): TreeNodeSchemaClass<
		`${TScope}.${Name}`,
		NodeKind.Object,
		T,
		ObjectFromSchemaRecord<T>,
		InsertableObjectFromSchemaRecord<T>
	> {
		class schema extends this.nodeSchema(name, NodeKind.Object, t) {
			public constructor(input: InsertableObjectFromSchemaRecord<T>) {
				super(input);
				if (isFlexTreeNode(input)) {
					// TODO: make return a proxy over this (or not a proxy).
					return createNodeProxy(input, this) as schema;
				} else {
					const flexSchema = getFlexSchema(this.constructor as TreeNodeSchema);
					return createRawObjectProxy(
						flexSchema as ObjectNodeSchema,
						input,
						this,
					) as schema;
				}
			}
		}

		return schema as TreeNodeSchemaClass<
			`${TScope}.${Name}`,
			NodeKind.Object,
			T,
			ObjectFromSchemaRecord<T>,
			InsertableObjectFromSchemaRecord<T>
		>;
	}

	/**
	 * Define a structurally typed {@link TreeNodeSchema} for a {@link TreeMapNode}.
	 *
	 * @remarks
	 * The {@link TreeNodeSchemaIdentifier} for this Map is defined as a function of the provided types.
	 * It is still scoped to this SchemaBuilder, but multiple calls with the same arguments will return the same schema object, providing somewhat structural typing.
	 * This does not support recursive types.
	 *
	 * If using these structurally named maps, other types in this schema builder should avoid names of the form `Map<${string}>`.
	 *
	 * If the returned class is subclassed, that subclass must be used for all matching lists or an error will occur when configuring the tree.
	 * @privateRemarks
	 * See note on list.
	 */
	public map<const T extends TreeNodeSchema | readonly TreeNodeSchema[]>(
		allowedTypes: T,
	): TreeNodeSchemaClass<
		`${TScope}.Map<${string}>`,
		NodeKind.Map,
		T,
		TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>,
		ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>
	>;

	/**
	 * Define a {@link TreeNodeSchema} for a {@link TreeMapNode}.
	 */
	public map<Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		`${TScope}.${Name}`,
		NodeKind.Map,
		T,
		TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>,
		ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>
	>;

	public map<const T extends ImplicitAllowedTypes>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		allowedTypes?: T,
	): TreeNodeSchemaClass<
		`${TScope}.${string}`,
		NodeKind.Map,
		T,
		TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>,
		ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>
	> {
		if (allowedTypes === undefined) {
			const types = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("Map", types);
			return getOrCreate(
				this.structuralTypes,
				fullName,
				() => this.namedMap(fullName as TName, nameOrAllowedTypes as T) as TreeNodeSchema,
			) as TreeNodeSchemaClass<
				`${TScope}.${string}`,
				NodeKind.Map,
				T,
				TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>,
				ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>
			>;
		}
		return this.namedMap(nameOrAllowedTypes as TName, allowedTypes);
	}

	private namedMap<Name extends TName | string, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		`${TScope}.${Name}`,
		NodeKind.Map,
		T,
		TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>,
		ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>
	> {
		class schema extends this.nodeSchema(name, NodeKind.Map, allowedTypes) {
			public constructor(input: ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>) {
				super(input);
				if (isFlexTreeNode(input)) {
					// TODO: make return a proxy over this (or not a proxy).
					return createNodeProxy(input, this) as schema;
				} else {
					// unhydrated data case.
					fail("todo");
				}
			}
		}

		return schema as TreeNodeSchemaClass<
			`${TScope}.${Name}`,
			NodeKind.Map,
			T,
			TreeMapNodeBase<TreeNodeFromImplicitAllowedTypes<T>>,
			ReadonlyMap<string, TreeNodeFromImplicitAllowedTypes<T>>
		>;
	}

	/**
	 * Define a structurally typed {@link TreeNodeSchema} for a {@link TreeListNode}.
	 *
	 * @remarks
	 * The identifier for this List is defined as a function of the provided types.
	 * It is still scoped to this SchemaFactory, but multiple calls with the same arguments will return the same schema object, providing somewhat structural typing.
	 * This does not support recursive types.
	 *
	 * If using these structurally named lists, other types in this schema builder should avoid names of the form `List<${string}>`.
	 *
	 * If the returned class is subclassed, that subclass must be used for all matching lists or an error will occur when configuring the tree.
	 *
	 * @privateRemarks
	 * The name produced at the type level here is not as specific as it could be, however doing type level sorting and escaping is a real mess.
	 * There are cases where not having this full type provided will be less than ideal since TypeScript's structural types.
	 * For example attempts to narrow unions of structural lists by name won't work.
	 * Planned future changes to move to a class based schema system as well as factor function based node construction should mostly avoid these issues,
	 * though there may still be some problematic cases even after that work is done.
	 */
	public list<const T extends TreeNodeSchema | readonly TreeNodeSchema[]>(
		allowedTypes: T,
	): TreeNodeSchemaClass<
		`${TScope}.List<${string}>`,
		NodeKind.List,
		T,
		TreeListNode<T>,
		Iterable<TreeNodeFromImplicitAllowedTypes<T>>
	>;

	/**
	 * Define (and add to this library) a {@link FieldNodeSchema} for a {@link TreeListNode}.
	 *
	 * The name must be unique among all TreeNodeSchema in the the document schema.
	 */
	public list<const Name extends TName, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		`${TScope}.${Name}`,
		NodeKind.List,
		T,
		TreeListNode<T>,
		Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>
	>;

	public list<const T extends ImplicitAllowedTypes>(
		nameOrAllowedTypes: TName | ((T & TreeNodeSchema) | readonly TreeNodeSchema[]),
		allowedTypes?: T,
	): TreeNodeSchemaClass<
		`${TScope}.${string}`,
		NodeKind.List,
		T,
		TreeListNode<T>,
		Iterable<TreeNodeFromImplicitAllowedTypes<T>>
	> {
		if (allowedTypes === undefined) {
			const types = nameOrAllowedTypes as (T & TreeNodeSchema) | readonly TreeNodeSchema[];
			const fullName = structuralName("List", types);
			return getOrCreate(this.structuralTypes, fullName, () =>
				this.namedList(fullName, nameOrAllowedTypes as T),
			) as TreeNodeSchemaClass<
				`${TScope}.${string}`,
				NodeKind.List,
				T,
				TreeListNode<T>,
				Iterable<TreeNodeFromImplicitAllowedTypes<T>>
			>;
		}
		return this.namedList(nameOrAllowedTypes as TName, allowedTypes);
	}

	/**
	 * Define a {@link TreeNodeSchema} for a {@link TreeListNode}.
	 *
	 * The name must be unique among all TreeNodeSchema in the the document schema.
	 */
	private namedList<Name extends TName | string, const T extends ImplicitAllowedTypes>(
		name: Name,
		allowedTypes: T,
	): TreeNodeSchemaClass<
		`${TScope}.${Name}`,
		NodeKind.List,
		T,
		TreeListNode<T>,
		Iterable<TreeNodeFromImplicitAllowedTypes<T>>
	> {
		// This class returns a proxy from its constructor to handle numeric indexing.
		// Alternatively it could extend a normal class which gets tons of numeric properties added.
		class schema extends this.nodeSchema(name, NodeKind.List, allowedTypes) {
			[x: number]: TreeNodeFromImplicitAllowedTypes<T>;
			public get length(): number {
				return fail("this exists only to make proxy valid");
			}
			public constructor(input: Iterable<TreeNodeFromImplicitAllowedTypes<T>>) {
				super(input);
				if (isFlexTreeNode(input)) {
					// TODO: make return a proxy over this (or not a proxy).
					return createNodeProxy(input, this) as schema;
				} else {
					// unhydrated data case.
					fail("todo");
				}
			}
		}
		return schema as unknown as TreeNodeSchemaClass<
			`${TScope}.${Name}`,
			NodeKind.List,
			T,
			TreeListNode<T>,
			Iterable<TreeNodeFromImplicitAllowedTypes<T>>
		>;
	}

	/**
	 * Make a field optional instead of the default which is required.
	 */
	public optional<const T extends ImplicitAllowedTypes>(
		t: T,
	): FieldSchema<FieldKind.Optional, T> {
		return new FieldSchema(FieldKind.Optional, t);
	}

	/**
	 * Function which can be used for its compile time side-effects to tweak the evaluation order of recursive types to make them compile.
	 * @remarks
	 * Some related information in https://github.com/microsoft/TypeScript/issues/55758.
	 *
	 * Also be aware that code which relies on this (or the "recursive" SchemaBuilder methods tends to break VSCode's IntelliSense every time anything related to that code (even comments) is edited.
	 * The command `TypeScript: Restart TS Server` should fix it.
	 * Sometimes this does not work: the exact cause has not been confirmed but if you have the file open multiple times (for example in both sides of a window split into two columns): closing the extra copy may help.
	 * Focusing the file with the errors before running `TypeScript: Restart TS Server` can also help.
	 * Real compile errors (for example elsewhere in the file) can also cause the IntelliSense to not work correctly ever after `TypeScript: Restart TS Server`.
	 */
	public fixRecursiveReference<T extends AllowedTypes>(...types: T): void {}
}

// TODO: unify this with logic in getOrCreateNodeProxy
export function createTree<T extends TreeNodeSchema>(
	schema: T,
	data: InsertableTypedNode<T> | FlexTreeNode,
): NodeFromSchema<T> {
	if (typeof schema === "function") {
		return new (schema as TreeNodeSchemaClass<
			any,
			any,
			any,
			any,
			InsertableTypedNode<T> | FlexTreeNode
		>)(data) as NodeFromSchema<T>;
	}
	return (
		schema as TreeNodeSchemaNonClass<any, any, any, any, InsertableTypedNode<T> | FlexTreeNode>
	).create(data) as NodeFromSchema<T>;
}

export function structuralName<const T extends string>(
	collectionName: T,
	allowedTypes: TreeNodeSchema | readonly TreeNodeSchema[],
): `${T}<${string}>` {
	let inner: string;
	if (!isReadonlyArray(allowedTypes)) {
		return structuralName(collectionName, [allowedTypes]);
	} else {
		const names = allowedTypes.map((t): string => {
			// Ensure that lazy types (functions) don't slip through here.
			assert(!isLazy(t), "invalid type provided");
			return t.identifier;
		});
		// Ensure name is order independent
		names.sort();
		// Ensure name can't have collisions by quoting and escaping any quotes in the names of types.
		// Using JSON is a simple way to accomplish this.
		// The outer `[]` around the result are also needed so that a single type name "Any" would not collide with the "any" case above.
		inner = JSON.stringify(names);
	}
	return `${collectionName}<${inner}>`;
}
