/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lazy, assert } from "@fluidframework/core-utils";
import {
	Adapters,
	EmptyKey,
	FieldKey,
	TreeNodeStoredSchema,
	TreeFieldStoredSchema,
	TreeNodeSchemaIdentifier,
	TreeTypeSet,
	ValueSchema,
	TreeStoredSchema,
	StoredSchemaCollection,
} from "../../core";
import {
	MakeNominal,
	Named,
	requireAssignableTo,
	compareSets,
	oneFromSet,
	Assume,
	mapIterable,
} from "../../util";
import { FieldKinds } from "../default-schema";
import { FieldKind, FullSchemaPolicy } from "../modular-schema";
import { LazyItem } from "./flexList";
import { ObjectToMap, objectToMapTyped } from "./typeUtils";

/**
 * @alpha
 */
export interface Fields {
	readonly [key: string]: TreeFieldSchema;
}

/**
 * @alpha
 */
export type NormalizeObjectNodeFields<T extends Fields> = {
	readonly [Property in keyof T]: NormalizeField<T[Property]>;
};

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
export abstract class TreeNodeSchemaBase<
	const out Name extends string = string,
	const out Specification = unknown,
> {
	protected _typeCheck?: MakeNominal;
	protected constructor(
		public readonly builder: Named<string>,
		public readonly name: TreeNodeSchemaIdentifier<Name>,
		public readonly info: Specification,
		public readonly stored: TreeNodeStoredSchema,
	) {}
	public abstract getFieldSchema(field: FieldKey): TreeFieldSchema;
}

/**
 * @alpha
 */
export class MapNodeSchema<
	const out Name extends string = string,
	const out Specification extends Unenforced<MapFieldSchema> = MapFieldSchema,
> extends TreeNodeSchemaBase<Name, Specification> {
	public get mapFields(): MapFieldSchema {
		return this.info as MapFieldSchema;
	}

	protected _typeCheck2?: MakeNominal;
	public static create<const Name extends string, const Specification extends MapFieldSchema>(
		builder: Named<string>,
		name: TreeNodeSchemaIdentifier<Name>,
		specification: Specification,
	): MapNodeSchema<Name, Specification> {
		return new MapNodeSchema(builder, name, specification, {
			objectNodeFields: new Map(),
			mapFields: specification as MapFieldSchema,
		});
	}

	public override getFieldSchema(field: FieldKey): MapFieldSchema {
		return this.info as MapFieldSchema;
	}
}

/**
 * @alpha
 */
export class LeafNodeSchema<
	const out Name extends string = string,
	const out Specification extends Unenforced<ValueSchema> = ValueSchema,
> extends TreeNodeSchemaBase<Name, Specification> {
	public get leafValue(): ValueSchema {
		return this.info as ValueSchema;
	}

	protected _typeCheck2?: MakeNominal;
	public static create<const Name extends string, const Specification extends ValueSchema>(
		builder: Named<string>,
		name: TreeNodeSchemaIdentifier<Name>,
		specification: Specification,
	): LeafNodeSchema<Name, Specification> {
		return new LeafNodeSchema(builder, name, specification, {
			objectNodeFields: new Map(),
			leafValue: specification,
		});
	}

	public override getFieldSchema(field: FieldKey): TreeFieldSchema {
		return TreeFieldSchema.empty;
	}
}

/**
 * @alpha
 */
export class ObjectNodeSchema<
	const out Name extends string = string,
	const out Specification extends Unenforced<Fields> = Fields,
> extends TreeNodeSchemaBase<Name, Specification> {
	protected _typeCheck2?: MakeNominal;

	public static create<const Name extends string, const Specification extends Fields>(
		builder: Named<string>,
		name: TreeNodeSchemaIdentifier<Name>,
		specification: Specification,
	): ObjectNodeSchema<Name, Specification> {
		const objectNodeFieldsObject: NormalizeObjectNodeFields<Specification> =
			normalizeStructFields<Specification>(specification);
		const objectNodeFields: ObjectToMap<
			NormalizeObjectNodeFields<Specification>,
			FieldKey,
			TreeFieldSchema
		> = objectToMapTyped(objectNodeFieldsObject);
		return new ObjectNodeSchema(
			builder,
			name,
			specification,
			objectNodeFieldsObject,
			objectNodeFields,
		);
	}

	private constructor(
		builder: Named<string>,
		name: TreeNodeSchemaIdentifier<Name>,
		info: Specification,
		public readonly objectNodeFieldsObject: NormalizeObjectNodeFields<
			Assume<Specification, Fields>
		>,
		// Allows reading fields through the normal map.
		// Stricter typing caused Specification to no longer be covariant, so has been removed.
		public readonly objectNodeFields: ReadonlyMap<FieldKey, TreeFieldSchema>,
	) {
		super(builder, name, info, { objectNodeFields });
	}

	public override getFieldSchema(field: FieldKey): TreeFieldSchema {
		return this.objectNodeFields.get(field) ?? TreeFieldSchema.empty;
	}
}

/**
 * @alpha
 * TODO: replace (or subclass) this with more specific types, like "List".
 */
export class FieldNodeSchema<
	Name extends string = string,
	Specification extends Unenforced<TreeFieldSchema> = TreeFieldSchema,
> extends TreeNodeSchemaBase<Name, Specification> {
	protected _typeCheck2?: MakeNominal;
	public static create<const Name extends string, const Specification extends TreeFieldSchema>(
		builder: Named<string>,
		name: TreeNodeSchemaIdentifier<Name>,
		specification: Specification,
	): FieldNodeSchema<Name, Specification> {
		return new FieldNodeSchema(builder, name, specification);
	}

	private constructor(
		builder: Named<string>,
		name: TreeNodeSchemaIdentifier<Name>,
		info: Specification,
	) {
		const objectNodeFields = new Map([[EmptyKey, info as TreeFieldSchema]]);
		super(builder, name, info, { objectNodeFields });
	}

	public override getFieldSchema(field?: FieldKey): TreeFieldSchema {
		return (field ?? EmptyKey) === EmptyKey
			? (this.info as TreeFieldSchema)
			: TreeFieldSchema.empty;
	}
}

/**
 * @alpha
 * @privateRemarks
 * This could be an exhaustive union, or just the common base type.
 * Using just the base type prevents exhaustive matching, which has both pros and cons.
 *
 * For now this is using just the base type since the union is causing issues with schema aware typing, likely due to it being a union and thus distributing over extends clauses.
 */
export type TreeNodeSchema = TreeNodeSchemaBase;

/**
 * Convert FieldSchemaSpecification | undefined into TreeFieldSchema.
 * @alpha
 */
export type NormalizeField<T extends TreeFieldSchema | undefined> = T extends TreeFieldSchema
	? T
	: TreeFieldSchema<typeof FieldKinds.forbidden, []>;

function normalizeStructFields<T extends Fields>(fields: T): NormalizeObjectNodeFields<T> {
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
 * Subset of TreeFieldSchema thats legal in maps.
 * This requires empty to be a valid value for the map.
 * @alpha
 */
export type MapFieldSchema = TreeFieldSchema<
	typeof FieldKinds.optional | typeof FieldKinds.sequence
>;

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
> implements TreeFieldStoredSchema
{
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
	public static createUnsafe<
		TKind extends FieldKind,
		const Types extends Unenforced<AllowedTypes>,
	>(kind: TKind, allowedTypes: Types): TreeFieldSchema<TKind, Types> {
		return new TreeFieldSchema(kind, allowedTypes);
	}

	protected _typeCheck?: MakeNominal;

	/**
	 * This is computed lazily since types can be recursive, which makes evaluating this have to happen after all the schema are defined.
	 */
	private readonly lazyTypes: Lazy<{
		names: TreeTypeSet;
		schema: AllowedTypeSet;
		monomorphicChildType?: TreeNodeSchema;
	}>;

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
					allowedType instanceof TreeNodeSchemaBase,
					0x7be /* Invalid entry in allowedTypes */,
				);
			}
		}
		this.lazyTypes = new Lazy(() => {
			const input = this.allowedTypes as unknown as AllowedTypes;
			const schema = allowedTypesSchemaSet(input);
			return {
				names: allowedTypesToTypeSet(input),
				schema,
				monomorphicChildType: schema !== Any ? oneFromSet(schema) : undefined,
			};
		});
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
	 * If exactly one type of child is allowed in this field, it is provided here.
	 * @remarks
	 * Some code paths (like unboxing and compressed tree encoding) special case schema with exactly one allowed type.
	 * This field allows for simple and optimized handling of this case.
	 */
	public get monomorphicChildType(): TreeNodeSchema | undefined {
		return this.lazyTypes.value.monomorphicChildType;
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
		assert(type instanceof TreeNodeSchemaBase, 0x7bf /* invalid allowed type */);
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
export interface FlexTreeSchema<out T extends TreeFieldSchema = TreeFieldSchema>
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

/**
 * Converts a {@link FlexTreeSchema} into a {@link TreeStoredSchema}.
 */
export function intoStoredSchema(treeSchema: FlexTreeSchema): TreeStoredSchema {
	return {
		rootFieldSchema: treeSchema.rootFieldSchema,
		...intoStoredSchemaCollection(treeSchema),
	};
}

/**
 * Converts a {@link SchemaCollection} into a {@link StoredSchemaCollection}.
 */
export function intoStoredSchemaCollection(treeSchema: SchemaCollection): StoredSchemaCollection {
	return {
		nodeSchema: new Map(
			mapIterable(treeSchema.nodeSchema.entries(), ([k, v]) => [k, v.stored]),
		),
	};
}

/**
 * Schema data that can be be used to view a document.
 * @alpha
 *
 * @privateRemarks
 * It is convenient that this can be used as a StoredSchemaCollection with no conversion.
 * There there isn't a design requirement for this however, so this extends clause can be removed later if needed.
 */
export interface SchemaCollection {
	/**
	 * {@inheritdoc SchemaCollection}
	 */
	readonly nodeSchema: ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeSchema>;
}

// These schema type narrowing functions are preferred over `instanceof` due to being easier to migrate to class based schema.

/**
 * Checks if a {@link TreeNodeSchema} is a {@link MapNodeSchema}.
 * @alpha
 */
export function schemaIsMap(schema: TreeNodeSchema): schema is MapNodeSchema {
	return schema instanceof MapNodeSchema;
}

/**
 * Checks if a {@link TreeNodeSchema} is a {@link LeafNodeSchema}.
 * @alpha
 */
export function schemaIsLeaf(schema: TreeNodeSchema): schema is LeafNodeSchema {
	return schema instanceof LeafNodeSchema;
}

/**
 * Checks if a {@link TreeNodeSchema} is a {@link FieldNodeSchema}.
 * @alpha
 */
export function schemaIsFieldNode(schema: TreeNodeSchema): schema is FieldNodeSchema {
	return schema instanceof FieldNodeSchema;
}

/**
 * Checks if a {@link TreeNodeSchema} is a {@link ObjectNodeSchema}.
 * @alpha
 */
export function schemaIsObjectNode(schema: TreeNodeSchema): schema is ObjectNodeSchema {
	return schema instanceof ObjectNodeSchema;
}
