/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lazy, assert } from "@fluidframework/core-utils";
import {
	Adapters,
	EmptyKey,
	FieldKey,
	TreeStoredSchema,
	StoredSchemaCollection,
	TreeNodeSchemaIdentifier,
	TreeTypeSet,
	ValueSchema,
} from "../../core";
import {
	MakeNominal,
	Assume,
	RestrictiveReadonlyRecord,
	_InlineTrick,
	FlattenKeys,
	Named,
	requireAssignableTo,
	compareSets,
} from "../../util";
import { FieldKinds } from "../default-field-kinds";
import { FieldKind, FullSchemaPolicy } from "../modular-schema";
import { LazyItem } from "./flexList";
import { ObjectToMap, WithDefault, objectToMapTyped } from "./typeUtils";

// TODO: tests for this file

/**
 * @alpha
 */
export interface Fields {
	readonly [key: string]: TreeFieldSchema;
}

/**
 * @alpha
 */
export type NormalizeObjectNodeFieldsInner<T extends Fields> = {
	[Property in keyof T]: NormalizeField<T[Property]>;
};

/**
 * @alpha
 */
export type NormalizeObjectNodeFields<T extends Fields | undefined> =
	NormalizeObjectNodeFieldsInner<WithDefault<T, Record<string, never>>>;

/**
 * A placeholder to use in extends constraints when using the real type breaks compilation of some recursive types due to [a design limitation of TypeScript](https://github.com/microsoft/TypeScript/issues/55758).
 *
 * These extends constraints only serve as documentation:
 * to avoid breaking compilation, this type has to not actually enforce anything, and thus is just `unknown`.
 * Therefore the type safety is the responsibility of the user of the API.
 * @alpha
 */
export type Unenforced<_DesiredExtendsConstraint> = unknown;

{
	type _check = requireAssignableTo<TreeNodeSchema, Unenforced<TreeNodeSchema>>;
}

/**
 * T must extend TreeSchemaSpecification.
 * This can not be enforced using TypeScript since doing so breaks recursive type support.
 * See note on SchemaBuilder.fieldRecursive.
 * @alpha
 */
export class TreeNodeSchema<
	Name extends string = string,
	T extends Unenforced<TreeSchemaSpecification> = TreeSchemaSpecification,
> {
	// Allows reading fields through the normal map, but without losing type information.
	public readonly objectNodeFields: ObjectToMap<
		NormalizeObjectNodeFields<Assume<T, TreeSchemaSpecification>["objectNodeFields"]>,
		FieldKey,
		TreeFieldSchema
	>;

	public readonly objectNodeFieldsObject: NormalizeObjectNodeFields<
		Assume<T, TreeSchemaSpecification>["objectNodeFields"]
	>;

	public readonly mapFields: WithDefault<
		Assume<T, TreeSchemaSpecification>["mapFields"],
		undefined
	>;
	// WithDefault is needed to convert unknown to undefined here (missing properties show up as unknown in types).
	public readonly leafValue: WithDefault<
		Assume<T, TreeSchemaSpecification>["leafValue"],
		undefined
	>;

	public readonly name: Name & TreeNodeSchemaIdentifier;

	public readonly info: Assume<T, TreeSchemaSpecification>;

	/**
	 * Version of constructor with extends clauses. See {@link Unenforced} for why TreeNodeSchema can't have them on the constructor.
	 */
	public static create<Name extends string, T extends TreeSchemaSpecification>(
		builder: Named<string>,
		name: Name,
		info: T,
	): TreeNodeSchema<Name, T> {
		return new TreeNodeSchema(builder, name, info);
	}

	private constructor(
		public readonly builder: Named<string>,
		name: Name,
		info: T,
	) {
		this.info = info as Assume<T, TreeSchemaSpecification>;
		this.name = name as Name & TreeNodeSchemaIdentifier;
		this.objectNodeFieldsObject = normalizeStructFields<
			Assume<T, TreeSchemaSpecification>["objectNodeFields"]
		>(this.info.objectNodeFields);
		this.objectNodeFields = objectToMapTyped(this.objectNodeFieldsObject);
		this.mapFields = this.info.mapFields as WithDefault<
			Assume<T, TreeSchemaSpecification>["mapFields"],
			undefined
		>;
		this.leafValue = this.info.leafValue as WithDefault<
			Assume<T, TreeSchemaSpecification>["leafValue"],
			undefined
		>;
	}
}

// TODO: TreeNodeSchema should be a union of the more specific schema type below, rather than containing all the info for all of them.
// When this change is made, FieldNodeSchema should be properly separated from ObjectNodeSchema,
// and the bellow type checks could be done with instanceof tests.

/**
 * @alpha
 */
export type MapSchema = TreeNodeSchema & MapSchemaSpecification;
/**
 * @alpha
 */
export type LeafSchema = TreeNodeSchema & LeafSchemaSpecification;

/**
 * TODO: this includes FieldNodeSchema when it shouldn't
 * @alpha
 */
export type ObjectNodeSchema = TreeNodeSchema & {
	[P in keyof (MapSchemaSpecification & LeafSchemaSpecification)]?: undefined;
};

/**
 * @alpha
 *
 * This is the subset of ObjectNodeSchema that uses {@link EmptyKey} so the the old (editable-tree 1) API unboxes it.
 * TODO: Once that API is removed, this can be cleaned up and properly separated from ObjectNodeSchema
 */
export type FieldNodeSchema = ObjectNodeSchema & {
	/**
	 * The fields of this node.
	 * Only uses the {@link EmptyKey}.
	 *
	 * TODO: this extra indirection will be removed when refactoring TreeNodeSchema (see other related TODOs for details).
	 */
	objectNodeFieldsObject: {
		/**
		 * The field this node wraps.
		 * It is under the {@link EmptyKey}.
		 */
		[""]: TreeFieldSchema;
	};
};

export function schemaIsMap(schema: TreeNodeSchema): schema is MapSchema {
	return schema.mapFields !== undefined;
}

export function schemaIsLeaf(schema: TreeNodeSchema): schema is LeafSchema {
	return schema.leafValue !== undefined;
}

/**
 * Checks if a {@link TreeNodeSchema} is a {@link FieldNodeSchema}.
 * @alpha
 */
export function schemaIsFieldNode(schema: TreeNodeSchema): schema is FieldNodeSchema {
	return schema.objectNodeFields.size === 1 && schema.objectNodeFields.has(EmptyKey);
}

export function schemaIsObjectNode(schema: TreeNodeSchema): schema is ObjectNodeSchema {
	return !schemaIsMap(schema) && !schemaIsLeaf(schema) && !schemaIsFieldNode(schema);
}

/**
 * Convert FieldSchemaSpecification | undefined into TreeFieldSchema.
 * @alpha
 */
export type NormalizeField<T extends TreeFieldSchema | undefined> = T extends TreeFieldSchema
	? T
	: TreeFieldSchema<typeof FieldKinds.forbidden, []>;

function normalizeStructFields<T extends Fields | undefined>(
	fields: T,
): NormalizeObjectNodeFields<T> {
	if (fields === undefined) {
		return {} as unknown as NormalizeObjectNodeFields<T>;
	}
	const out: Record<string, TreeFieldSchema> = {};
	// eslint-disable-next-line no-restricted-syntax
	for (const key in fields) {
		if (Object.prototype.hasOwnProperty.call(fields, key)) {
			const element = fields[key];
			out[key] = normalizeField(element);
		}
	}
	return out as NormalizeObjectNodeFields<T>;
}

function normalizeField<T extends TreeFieldSchema | undefined>(t: T): NormalizeField<T> {
	if (t === undefined) {
		return TreeFieldSchema.empty as unknown as NormalizeField<T>;
	}

	assert(t instanceof TreeFieldSchema, 0x6ae /* invalid TreeFieldSchema */);
	return t as NormalizeField<T>;
}

/**
 * Allow any node (as long as it meets the schema for its own type).
 * @alpha
 */
export const Any = "Any" as const;
/**
 * Allow any node (as long as it meets the schema for its own type).
 * @alpha
 */
export type Any = typeof Any;

/**
 * Tree type, but can be wrapped in a function to allow referring to types before they are declared.
 * This makes recursive and co-recursive types possible.
 * @alpha
 */
export type LazyTreeNodeSchema = TreeNodeSchema | (() => TreeNodeSchema);

/**
 * Types for use in fields.
 *
 * "Any" is boxed in an array to allow use as variadic parameter.
 * @alpha
 */
export type AllowedTypes = readonly [Any] | readonly LazyItem<TreeNodeSchema>[];

/**
 * Checks if an {@link AllowedTypes} is {@link (Any:type)}.
 * @alpha
 */
export function allowedTypesIsAny(t: AllowedTypes): t is readonly [Any] {
	return t.length === 1 && t[0] === Any;
}

/**
 * `TreeSchemaSpecification` for {@link SchemaBuilderBase.object}.
 * @alpha
 */
export interface ObjectSchemaSpecification {
	readonly objectNodeFields: RestrictiveReadonlyRecord<string, TreeFieldSchema>;
}

/**
 * `TreeSchemaSpecification` for {@link SchemaBuilderBase.map}.
 * @alpha
 */
export interface MapSchemaSpecification {
	readonly mapFields: MapFieldSchema;
}

/**
 * Subset of TreeFieldSchema thats legal in maps.
 * This requires empty to be a valid value for the map.
 * @alpha
 */
export type MapFieldSchema = TreeFieldSchema<
	typeof FieldKinds.optional | typeof FieldKinds.sequence
>;

/**
 * `TreeSchemaSpecification` for {@link Leaf}.
 * @alpha
 */
export interface LeafSchemaSpecification {
	readonly leafValue: ValueSchema;
}

/**
 * Object for capturing information about a TreeNodeStoredSchema for use at both compile time and runtime.
 * @alpha
 */
export type TreeSchemaSpecification = [
	FlattenKeys<
		(ObjectSchemaSpecification | MapSchemaSpecification | LeafSchemaSpecification) &
			Partial<ObjectSchemaSpecification & MapSchemaSpecification & LeafSchemaSpecification>
	>,
][_InlineTrick];

/**
 * All policy for a specific field,
 * including functionality that does not have to be kept consistent across versions or deterministic.
 *
 * This can include policy for how to use this schema for "view" purposes, and well as how to expose editing APIs.
 *
 * @remarks
 * `Types` here must extend `AllowedTypes`, but this cannot be enforced with an "extends" clause: see {@link Unenforced} for details.
 *
 * @typeParam TKind - The kind of field.
 * @typeParam TTypes - The types allowed by the field.
 *
 * @sealed
 * @alpha
 */
export class TreeFieldSchema<
	out TKind extends FieldKind = FieldKind,
	const out TTypes extends Unenforced<AllowedTypes> = AllowedTypes,
> {
	/**
	 * Schema for a field which must always be empty.
	 */
	public static readonly empty = TreeFieldSchema.create(FieldKinds.forbidden, []);

	/**
	 * Constructs a TreeFieldSchema.
	 * @privateRemarks
	 * Alias for the constructor, but with extends clause for the `Types` parameter that {@link TreeFieldSchema} can not have (due to recursive type issues).
	 */
	public static create<TKind extends FieldKind, const Types extends AllowedTypes>(
		kind: TKind,
		allowedTypes: Types,
	): TreeFieldSchema<TKind, Types> {
		return new TreeFieldSchema(kind, allowedTypes);
	}

	/**
	 * Constructs a TreeFieldSchema, but missing the extends clause which breaks most recursive types.
	 * @remarks
	 * `Types` here must extend `AllowedTypes`, but this cannot be enforced with an "extends" clause: see {@link Unenforced} for details.
	 * Prefer {@link TreeFieldSchema.create} when possible.
	 */
	public static createUnsafe<TKind extends FieldKind, const Types>(
		kind: TKind,
		allowedTypes: Types,
	): TreeFieldSchema<TKind, Types> {
		return new TreeFieldSchema(kind, allowedTypes);
	}

	protected _typeCheck?: MakeNominal;

	/**
	 * This is computed lazily since types can be recursive, which makes evaluating this have to happen after all the schema are defined.
	 */
	private readonly lazyTypes: Lazy<{ names: TreeTypeSet; schema: AllowedTypeSet }>;

	/**
	 * @param kind - The {@link https://en.wikipedia.org/wiki/Kind_(type_theory) | kind} of this field.
	 * Determine the multiplicity, viewing and editing APIs as well as the merge resolution policy.
	 * @param allowedTypes - What types of tree nodes are allowed in this field.
	 */
	private constructor(
		public readonly kind: TKind,
		public readonly allowedTypes: TTypes,
	) {
		// Since this class can't have the desired extends clause, do some extra runtime validation:
		assert(Array.isArray(allowedTypes), 0x7bc /* Invalid allowedTypes */);
		for (const allowedType of allowedTypes) {
			if (allowedType === Any) {
				assert(allowedTypes.length === 1, 0x7bd /* Invalid Any in allowedTypes */);
			} else if (typeof allowedType !== "function") {
				assert(
					allowedType instanceof TreeNodeSchema,
					0x7be /* Invalid entry in allowedTypes */,
				);
			}
		}
		this.lazyTypes = new Lazy(() => ({
			names: allowedTypesToTypeSet(this.allowedTypes as unknown as AllowedTypes),
			schema: allowedTypesSchemaSet(this.allowedTypes as unknown as AllowedTypes),
		}));
	}

	/**
	 * Types which are allowed in this field (by {@link TreeNodeSchemaIdentifier}), in a format optimized for stored schema.
	 * This is the same set of types in {@link TreeFieldSchema.allowedTypes}, just in a different format.
	 */
	public get types(): TreeTypeSet {
		return this.lazyTypes.value.names;
	}

	/**
	 * Types which are allowed in this field.
	 * This is the same set of types in {@link TreeFieldSchema.allowedTypes}, just as a set with laziness removed.
	 * @privateRemarks
	 * TODO:
	 * 3 ways to access the allowed types are now exposed.
	 * Reducing this and/or renaming the more friendly options to take the shorter name (`types`)
	 * would be a good idea.
	 */
	public get allowedTypeSet(): AllowedTypeSet {
		return this.lazyTypes.value.schema;
	}

	/**
	 * Compare this schema to another.
	 *
	 * @returns true iff the schema are identical.
	 */
	public equals(other: TreeFieldSchema): boolean {
		if (other.kind !== this.kind) {
			return false;
		}
		if (other.types === undefined) {
			return this.types === undefined;
		}
		if (this.types === undefined) {
			return false;
		}
		return compareSets({
			a: this.types,
			b: other.types,
			aExtra: () => false,
			bExtra: () => false,
		});
	}
}

/**
 * Types for use in fields.
 * This representation is optimized for runtime use in view-schema.
 *
 * @remarks
 * See {@link TreeTypeSet} for a stored-schema compatible version using the {@link TreeNodeSchemaIdentifier}.
 * See {@link AllowedTypes} for a compile time optimized version.
 * @alpha
 */
export type AllowedTypeSet = Any | ReadonlySet<TreeNodeSchema>;

/**
 * Convert {@link AllowedTypes} to {@link TreeTypeSet}.
 * @alpha
 */
export function allowedTypesSchemaSet(t: AllowedTypes): AllowedTypeSet {
	if (allowedTypesIsAny(t)) {
		return Any;
	}
	const list: TreeNodeSchema[] = t.map((value: LazyItem<TreeNodeSchema>) => {
		if (typeof value === "function") {
			return value();
		}
		return value;
	});
	return new Set(list);
}

/**
 * Convert {@link AllowedTypes} to {@link TreeTypeSet}.
 * @alpha
 */
export function allowedTypesToTypeSet(t: AllowedTypes): TreeTypeSet {
	const list = allowedTypesSchemaSet(t);
	if (list === Any) {
		return undefined;
	}
	const names = Array.from(list, (type) => {
		assert(type instanceof TreeNodeSchema, 0x7bf /* invalid allowed type */);
		return type.name;
	});
	return new Set(names);
}

/**
 * Schema data that can be be used to view a document.
 * Strongly typed over its rootFieldSchema.
 *
 * @remarks
 * The type of the rootFieldSchema is used to implement SchemaAware APIs.
 * Cases that do not require being compile time schema aware can omit the explicit type for it.
 *
 * @alpha
 */

export interface TreeSchema<out T extends TreeFieldSchema = TreeFieldSchema>
	extends SchemaCollection {
	/**
	 * Schema for the root field which contains the whole tree.
	 */
	readonly rootFieldSchema: T;
	/**
	 * Extra configuration for how this schema is handled at runtime.
	 */
	readonly policy: FullSchemaPolicy;
	/**
	 * Compatibility information how how to interact with content who's stored schema is not directly compatible with this schema.
	 */
	readonly adapters: Adapters;
}

{
	// It is convenient that TreeSchema can be used as a TreeStoredSchema with no conversion.
	// This type check ensures this ability is not broken on accident (if it needs to be broken on purpose for some reason thats fine: just delete this check).
	// Since TypeScript does not allow extending two types with the same field (even if they are compatible),
	// this check cannot be done by adding an extends clause to TreeSchema.
	type _check = requireAssignableTo<TreeSchema, TreeStoredSchema>;
}

/**
 * Schema data that can be be used to view a document.
 * @alpha
 *
 * @privateRemarks
 * It is convenient that this can be used as a StoredSchemaCollection with no conversion.
 * There there isn't a design requirement for this however, so this extends clause can be removed later if needed.
 */

export interface SchemaCollection extends StoredSchemaCollection {
	/**
	 * {@inheritdoc SchemaCollection}
	 */
	readonly nodeSchema: ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeSchema>;
}
