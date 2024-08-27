/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Lazy } from "@fluidframework/core-utils/internal";

import {
	type Adapters,
	type FieldKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type StoredSchemaCollection,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	type TreeTypeSet,
	type ValueSchema,
	identifierFieldKindIdentifier,
} from "../../core/index.js";
import {
	type MakeNominal,
	type Named,
	compareSets,
	mapIterable,
	oneFromSet,
	type requireAssignableTo,
	filterIterable,
} from "../../util/index.js";
import { FieldKinds } from "../default-schema/index.js";
import type { FlexFieldKind, FullSchemaPolicy } from "../modular-schema/index.js";

import type { LazyItem } from "./flexList.js";
import { type ObjectToMap, objectToMapTyped } from "./typeUtils.js";

/**
 */
export interface FlexObjectNodeFields {
	readonly [key: string]: FlexFieldSchema;
}

/**
 */
export type NormalizeObjectNodeFields<T extends FlexObjectNodeFields> = {
	readonly [Property in keyof T]: NormalizeField<T[Property]>;
};

/**
 * A placeholder to use in {@link https://www.typescriptlang.org/docs/handbook/2/generics.html#generic-constraints | extends constraints} when using the real type breaks compilation of some recursive types due to {@link https://github.com/microsoft/TypeScript/issues/55758 | a design limitation of TypeScript}.
 *
 * These extends constraints only serve as documentation:
 * to avoid breaking compilation, this type has to not actually enforce anything, and thus is just `unknown`.
 * Therefore the type safety is the responsibility of the user of the API.
 * @public
 */
export type Unenforced<_DesiredExtendsConstraint> = unknown;

{
	type _check = requireAssignableTo<FlexTreeNodeSchema, Unenforced<FlexTreeNodeSchema>>;
}

/**
 * T must extend TreeSchemaSpecification.
 * This can not be enforced using TypeScript since doing so breaks recursive type support.
 * See note on SchemaBuilder.fieldRecursive.
 */
export abstract class TreeNodeSchemaBase<
	const out Name extends string = string,
	const out Specification = unknown,
> {
	protected _typeCheck!: MakeNominal;
	protected constructor(
		public readonly builder: Named<string>,
		public readonly name: TreeNodeSchemaIdentifier<Name>,
		public readonly info: Specification,
		public readonly stored: TreeNodeStoredSchema,
	) {}
	public abstract getFieldSchema(field: FieldKey): FlexFieldSchema;
}

/**
 */
export class FlexMapNodeSchema<
	const out Name extends string = string,
	const out Specification extends Unenforced<FlexMapFieldSchema> = FlexMapFieldSchema,
> extends TreeNodeSchemaBase<Name, Specification> {
	public get mapFields(): FlexMapFieldSchema {
		return this.info as FlexMapFieldSchema;
	}

	protected _typeCheck2?: MakeNominal;
	public static create<
		const Name extends string,
		const Specification extends FlexMapFieldSchema,
	>(
		builder: Named<string>,
		name: TreeNodeSchemaIdentifier<Name>,
		specification: Specification,
	): FlexMapNodeSchema<Name, Specification> {
		return new FlexMapNodeSchema(
			builder,
			name,
			specification,
			new MapNodeStoredSchema(specification.stored),
		);
	}

	public override getFieldSchema(field: FieldKey): FlexMapFieldSchema {
		return this.info as FlexMapFieldSchema;
	}
}

/**
 */
export class LeafNodeSchema extends TreeNodeSchemaBase<string, ValueSchema> {
	public get leafValue(): ValueSchema {
		return this.info;
	}

	protected _typeCheck2?: MakeNominal;
	public static create<const Name extends string, const Specification extends ValueSchema>(
		builder: Named<string>,
		name: TreeNodeSchemaIdentifier<Name>,
		specification: Specification,
	): LeafNodeSchema {
		return new LeafNodeSchema(
			builder,
			name,
			specification,
			new LeafNodeStoredSchema(specification),
		);
	}

	public override getFieldSchema(field: FieldKey): FlexFieldSchema {
		return FlexFieldSchema.empty;
	}
}

/**
 */
export class FlexObjectNodeSchema extends TreeNodeSchemaBase<string, FlexObjectNodeFields> {
	protected _typeCheck2?: MakeNominal;
	public readonly identifierFieldKeys: readonly FieldKey[] = [];

	public static create(
		builder: Named<string>,
		name: TreeNodeSchemaIdentifier,
		specification: FlexObjectNodeFields,
	): FlexObjectNodeSchema {
		const objectNodeFieldsObject: NormalizeObjectNodeFields<FlexObjectNodeFields> =
			normalizeStructFields<FlexObjectNodeFields>(specification);
		const objectNodeFields: ObjectToMap<
			NormalizeObjectNodeFields<FlexObjectNodeFields>,
			FieldKey,
			FlexFieldSchema
		> = objectToMapTyped(objectNodeFieldsObject);
		return new FlexObjectNodeSchema(
			builder,
			name,
			specification,
			objectNodeFieldsObject,
			objectNodeFields,
		);
	}

	private constructor(
		builder: Named<string>,
		name: TreeNodeSchemaIdentifier,
		info: FlexObjectNodeFields,
		public readonly objectNodeFieldsObject: NormalizeObjectNodeFields<FlexObjectNodeFields>,
		// Allows reading fields through the normal map.
		// Stricter typing caused Specification to no longer be covariant, so has been removed.
		public readonly objectNodeFields: ReadonlyMap<FieldKey, FlexFieldSchema>,
	) {
		const fields = mapIterable(objectNodeFields, ([k, v]) => [k, v.stored] as const);
		super(builder, name, info, new ObjectNodeStoredSchema(new Map(fields)));
		this.identifierFieldKeys = Array.from(
			filterIterable(
				objectNodeFields.entries(),
				([k, f]) => f.kind.identifier === identifierFieldKindIdentifier,
			),
			([k]) => k,
		);
	}

	public override getFieldSchema(field: FieldKey): FlexFieldSchema {
		return this.objectNodeFields.get(field) ?? FlexFieldSchema.empty;
	}
}

/**
 * @privateRemarks
 * This could be an exhaustive union, or just the common base type.
 * Using just the base type prevents exhaustive matching, which has both pros and cons.
 *
 * For now this is using just the base type since the union is causing issues with schema aware typing, likely due to it being a union and thus distributing over extends clauses.
 */
export type FlexTreeNodeSchema = TreeNodeSchemaBase;

/**
 * Convert FieldSchemaSpecification | undefined into TreeFieldSchema.
 */
export type NormalizeField<T extends FlexFieldSchema | undefined> = T extends FlexFieldSchema
	? T
	: FlexFieldSchema<typeof FieldKinds.forbidden>;

function normalizeStructFields<T extends FlexObjectNodeFields>(
	fields: T,
): NormalizeObjectNodeFields<T> {
	const out: Record<string, FlexFieldSchema> = {};
	// eslint-disable-next-line no-restricted-syntax
	for (const key in fields) {
		if (Object.prototype.hasOwnProperty.call(fields, key)) {
			const element = fields[key];
			out[key] = normalizeField(element);
		}
	}
	return out as NormalizeObjectNodeFields<T>;
}

function normalizeField<T extends FlexFieldSchema | undefined>(t: T): NormalizeField<T> {
	if (t === undefined) {
		return FlexFieldSchema.empty as unknown as NormalizeField<T>;
	}

	assert(t instanceof FlexFieldSchema, 0x6ae /* invalid TreeFieldSchema */);
	return t as NormalizeField<T>;
}

/**
 * Tree type, but can be wrapped in a function to allow referring to types before they are declared.
 * This makes recursive and co-recursive types possible.
 */
export type LazyTreeNodeSchema = FlexTreeNodeSchema | (() => FlexTreeNodeSchema);

/**
 * Types for use in fields.
 */
export type FlexAllowedTypes = readonly LazyItem<FlexTreeNodeSchema>[];

/**
 * Subset of TreeFieldSchema thats legal in maps.
 * This requires empty to be a valid value for the map.
 */
export type FlexMapFieldSchema = FlexFieldSchema<
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
 */
export class FlexFieldSchema<out TKind extends FlexFieldKind = FlexFieldKind> {
	/**
	 * Schema for a field which must always be empty.
	 */
	public static readonly empty = FlexFieldSchema.create(FieldKinds.forbidden, []);

	/**
	 * Constructs a TreeFieldSchema.
	 * @privateRemarks
	 * Alias for the constructor, but with extends clause for the `Types` parameter that {@link FlexFieldSchema} can not have (due to recursive type issues).
	 */
	public static create<TKind extends FlexFieldKind>(
		kind: TKind,
		allowedTypes: FlexAllowedTypes,
	): FlexFieldSchema<TKind> {
		return new FlexFieldSchema(kind, allowedTypes);
	}

	protected _typeCheck!: MakeNominal;

	/**
	 * This is computed lazily since types can be recursive, which makes evaluating this have to happen after all the schema are defined.
	 */
	private readonly lazyTypes: Lazy<{
		names: TreeTypeSet;
		schema: AllowedTypeSet;
		monomorphicChildType?: FlexTreeNodeSchema;
	}>;

	/**
	 * @param kind - The {@link https://en.wikipedia.org/wiki/Kind_(type_theory) | kind} of this field.
	 * Determine the multiplicity, viewing and editing APIs as well as the merge resolution policy.
	 * @param allowedTypes - What types of tree nodes are allowed in this field.
	 */
	private constructor(
		public readonly kind: TKind,
		public readonly allowedTypes: FlexAllowedTypes,
	) {
		// Since this class can't have the desired extends clause, do some extra runtime validation:
		assert(Array.isArray(allowedTypes), 0x7bc /* Invalid allowedTypes */);
		for (const allowedType of allowedTypes) {
			if (typeof allowedType !== "function") {
				assert(
					allowedType instanceof TreeNodeSchemaBase,
					0x7be /* Invalid entry in allowedTypes */,
				);
			}
		}

		const lazy = new Lazy(() => {
			const input = this.allowedTypes as unknown as FlexAllowedTypes;
			const schema = allowedTypesSchemaSet(input);
			return {
				names: allowedTypesToTypeSet(input),
				schema,
				monomorphicChildType: oneFromSet(schema),
			};
		});

		this.lazyTypes = lazy;

		this.stored = {
			kind: this.kind.identifier,
			get types() {
				return lazy.value.names;
			},
		};
	}

	public readonly stored: TreeFieldStoredSchema;

	/**
	 * Types which are allowed in this field (by {@link TreeNodeSchemaIdentifier}), in a format optimized for stored schema.
	 * This is the same set of types in {@link FlexFieldSchema.allowedTypes}, just in a different format.
	 */
	public get types(): TreeTypeSet {
		return this.lazyTypes.value.names;
	}

	/**
	 * Types which are allowed in this field.
	 * This is the same set of types in {@link FlexFieldSchema.allowedTypes}, just as a set with laziness removed.
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
	public get monomorphicChildType(): FlexTreeNodeSchema | undefined {
		return this.lazyTypes.value.monomorphicChildType;
	}

	/**
	 * Compare this schema to another.
	 *
	 * @returns true iff the schema are identical.
	 */
	public equals(other: FlexFieldSchema): boolean {
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
 * See {@link FlexAllowedTypes} for a compile time optimized version.
 */
export type AllowedTypeSet = ReadonlySet<FlexTreeNodeSchema>;

/**
 * Convert {@link FlexAllowedTypes} to {@link TreeTypeSet}.
 */
export function allowedTypesSchemaSet(t: FlexAllowedTypes): AllowedTypeSet {
	const list: FlexTreeNodeSchema[] = t.map((value: LazyItem<FlexTreeNodeSchema>) => {
		if (typeof value === "function") {
			return value();
		}
		return value;
	});
	return new Set(list);
}

/**
 * Convert {@link FlexAllowedTypes} to {@link TreeTypeSet}.
 */
export function allowedTypesToTypeSet(t: FlexAllowedTypes): TreeTypeSet {
	const list = allowedTypesSchemaSet(t);
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
 */
export interface FlexTreeSchema<out T extends FlexFieldSchema = FlexFieldSchema>
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
		rootFieldSchema: treeSchema.rootFieldSchema.stored,
		...intoStoredSchemaCollection(treeSchema),
	};
}

/**
 * Converts a {@link SchemaCollection} into a {@link StoredSchemaCollection}.
 */
export function intoStoredSchemaCollection(
	treeSchema: SchemaCollection,
): StoredSchemaCollection {
	return {
		nodeSchema: new Map(
			mapIterable(treeSchema.nodeSchema.entries(), ([k, v]) => [k, v.stored]),
		),
	};
}

/**
 * Schema data that can be be used to view a document.
 *
 * @privateRemarks
 * It is convenient that this can be used as a StoredSchemaCollection with no conversion.
 * There there isn't a design requirement for this however, so this extends clause can be removed later if needed.
 */
export interface SchemaCollection {
	/**
	 * {@inheritdoc SchemaCollection}
	 */
	readonly nodeSchema: ReadonlyMap<TreeNodeSchemaIdentifier, FlexTreeNodeSchema>;
}

// These schema type narrowing functions are preferred over `instanceof` due to being easier to migrate to class based schema.

/**
 * Checks if a {@link FlexTreeNodeSchema} is a {@link FlexMapNodeSchema}.
 */
export function schemaIsMap(schema: FlexTreeNodeSchema): schema is FlexMapNodeSchema {
	return schema instanceof FlexMapNodeSchema;
}

/**
 * Checks if a {@link FlexTreeNodeSchema} is a {@link LeafNodeSchema}.
 */
export function schemaIsLeaf(schema: FlexTreeNodeSchema): schema is LeafNodeSchema {
	return schema instanceof LeafNodeSchema;
}

/**
 * Checks if a {@link FlexTreeNodeSchema} is a {@link FlexObjectNodeSchema}.
 */
export function schemaIsObjectNode(
	schema: FlexTreeNodeSchema,
): schema is FlexObjectNodeSchema {
	return schema instanceof FlexObjectNodeSchema;
}
