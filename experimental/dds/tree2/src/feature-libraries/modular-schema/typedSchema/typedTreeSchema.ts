/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { UntypedTreeCore } from "../../untypedTree";
import { FieldViewSchema, TreeViewSchema } from "../view";
import { contextSymbol, typeSymbol } from "../../editable-tree";
import {
	GlobalFieldKey,
	GlobalFieldKeySymbol,
	LocalFieldKey,
	Named,
	TreeSchemaIdentifier,
	TreeTypeSet,
	ValueSchema,
} from "../../../core";
import { FieldKinds } from "../..";
import { forbidden, value } from "../../defaultFieldKinds";
import { brand } from "../../../util";
import { FlexList, FlexListToLazyArray, normalizeFlexList } from "./flexList";
import { ObjectToMap, WithDefault, objectToMap } from "./typeUtils";

// TODO: tests for this file

interface LocalFields {
	readonly [key: string]: FieldSchemaSpecification | undefined;
}

type NormalizeLocalFieldsInner<T extends LocalFields> = ObjectToMap<
	{ [Property in keyof T]: NormalizeField<T[Property]> },
	LocalFieldKey,
	FieldViewSchema
>;

type NormalizeLocalFields<T extends LocalFields | undefined> = NormalizeLocalFieldsInner<
	WithDefault<T, Record<string, never>>
>;

export class TypedTreeSchema<T extends TypedTreeSchemaSpecification = any>
	implements TreeViewSchema
{
	// Allows reading localFields through the normal map, but without losing type information.
	public readonly localFields: NormalizeLocalFields<T["local"]>;

	public readonly globalFields!: ReadonlySet<GlobalFieldKey>;
	public readonly extraLocalFields: FieldViewSchema;
	public readonly extraGlobalFields: boolean;
	public readonly value: ValueSchema;

	public readonly name: TreeSchemaIdentifier;

	public constructor(
		public readonly builder: Named<string>,
		name: string,
		public readonly info: T,
	) {
		this.name = brand(name);
		this.localFields = normalizeLocalFields<T["local"]>(builder, info.local);
		this.extraLocalFields = normalizeField(builder, info.extraLocalFields);
		this.extraGlobalFields = info.extraGlobalFields ?? false;
		this.value = info.value ?? ValueSchema.Nothing;
	}

	public downCast(tree: UntypedTreeCore): tree is TypedTree<T> {
		const contextSchema = tree[contextSymbol].schema;
		const lookedUp = contextSchema.treeSchema.get(this.name);
		// TODO: for this to pass, schematized view must have the view schema, not just stored schema.
		assert(lookedUp === this, "cannot downcase to a schema the tree is not using");

		// TODO: make this actually work
		const matches = tree[typeSymbol] === this;
		assert(
			matches === (tree[typeSymbol].name === this.name),
			"schema object identity comparison should match identifier comparison",
		);
		return matches;
	}
}

/**
 * Convert FieldSchemaSpecification | undefined into FieldViewSchema
 */
type NormalizeField<T extends FieldSchemaSpecification | undefined> = FieldViewSchema<
	T extends undefined
		? typeof forbidden
		: T extends FieldSchemaWithKind<infer Kind>
		? Kind
		: typeof value
>;

function normalizeLocalFields<T extends LocalFields | undefined>(
	builder: Named<string>,
	fields: T,
): NormalizeLocalFields<T> {
	if (fields === undefined) {
		return new Map();
	}
	const out: Record<string, FieldViewSchema> = {};
	// eslint-disable-next-line no-restricted-syntax
	for (const key in fields) {
		if (Object.prototype.hasOwnProperty.call(fields, key)) {
			const element = fields[key];
			out[key] = normalizeField(builder, element);
		}
	}
	const map = objectToMap(out);
	return map as NormalizeLocalFields<T>;
}

function normalizeField<T extends FieldSchemaSpecification | undefined>(
	builder: Named<string>,
	t: T,
): NormalizeField<T> {
	if (t === undefined) {
		const result: FieldViewSchema<typeof forbidden> = {
			kind: forbidden,
			types: new Set(),
			builder,
		};
		return result as NormalizeField<T>;
	} else if (t instanceof FieldSchemaWithKind) {
		const result: FieldViewSchema = {
			kind: t.kind,
			types: allowedTypesToTypeSet(t.types),
			builder,
		};
		return result as NormalizeField<T>;
	} else {
		const result: FieldViewSchema<typeof value> = {
			kind: value,
			types: allowedTypesToTypeSet(t),
			builder,
		};
		return result as NormalizeField<T>;
	}
}

// TODO: maybe remove the need for this here? Just use AllowedTypes in view schema?
function allowedTypesToTypeSet(t: AllowedTypes): TreeTypeSet {
	const normalized = normalizeAllowedTypes(t);
	if (Array.isArray(normalized)) {
		// TODO: don't remove laziness here.
		return new Set(normalized.map((lazy) => lazy().name));
	}
	assert(normalized === Any, "invalid AllowedTypes");
	return undefined;
}

type TypedTree<_T> = UntypedTreeCore & { todo: "add stuff" };

export const Any = "Any" as const;
export type Any = typeof Any;

/**
 * Tree type, but can be wrapped in a function to allow referring to types before they are declared.
 * This makes recursive and co-recursive types possible.
 */
export type LazyTreeSchema = TypedTreeSchema | (() => TypedTreeSchema);

export type NormalizedAllowedTypes = Any | readonly TypedTreeSchema[];
export type NormalizedLazyAllowedTypes = Any | (() => TypedTreeSchema)[];

/**
 * Types for use in fields.
 */
export type AllowedTypes = Any | FlexList<TypedTreeSchema>;

/**
 * Convert AllowedTypes into NormalizedLazyAllowedTypes
 */
type NormalizeAllowedTypes<T extends AllowedTypes> = T extends Any
	? Any
	: FlexListToLazyArray<TypedTreeSchema, T>;

export function normalizeAllowedTypes<T extends AllowedTypes>(t: T): NormalizeAllowedTypes<T> {
	if (t === Any) {
		return Any as NormalizeAllowedTypes<T>;
	}
	return normalizeFlexList(t) as NormalizeAllowedTypes<T>;
}

type FieldSchemaSpecification = AllowedTypes | FieldSchemaWithKind;

/**
 * Object for capturing information about a TreeSchema for use at both compile time and runtime.
 * @alpha
 */
export interface TypedTreeSchemaSpecification {
	readonly local?: { readonly [key: string]: FieldSchemaSpecification | undefined };
	readonly global?: FlexList<GlobalFieldSchema>;
	readonly extraLocalFields?: FieldSchemaSpecification;
	readonly extraGlobalFields?: boolean;
	readonly value?: ValueSchema;
}

export type GlobalFieldSchema<T = unknown> = TypedFieldSchema<T> & Named<GlobalFieldKeySymbol>;

type Kinds = typeof FieldKinds[keyof typeof FieldKinds];

/**
 * @sealed @alpha
 */
export class FieldSchemaWithKind<
	Kind extends Kinds = Kinds,
	Types extends AllowedTypes = AllowedTypes,
> {
	public constructor(public readonly kind: Kind, public readonly types: Types) {}
}

export interface TypedFieldSchema<T = unknown> extends FieldViewSchema {
	readonly info: T;
}
