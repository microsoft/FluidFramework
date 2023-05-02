/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { UntypedTreeCore } from "../../untypedTree";
import { IFieldSchema, ITreeSchema } from "../view";
import { contextSymbol, typeSymbol } from "../../editable-tree";
import {
	GlobalFieldKey,
	GlobalFieldKeySymbol,
	LocalFieldKey,
	Named,
	TreeSchemaIdentifier,
	TreeTypeSet,
	ValueSchema,
	symbolFromKey,
} from "../../../core";
import { FieldKinds } from "../..";
import { forbidden, value } from "../../defaultFieldKinds";
import { MakeNominal } from "../../../util";
import { FlexList, FlexListToLazyArray, LazyItem, normalizeFlexList } from "./flexList";
import { Assume, ObjectToMap, WithDefault, objectToMap } from "./typeUtils";

// TODO: tests for this file

interface LocalFields {
	readonly [key: string]: FieldSchemaSpecification | undefined;
}

type NormalizeLocalFieldsInner<T extends LocalFields> = {
	[Property in keyof T]: NormalizeField<T[Property]>;
};

type NormalizeLocalFields<T extends LocalFields | undefined> = NormalizeLocalFieldsInner<
	WithDefault<T, Record<string, never>>
>;

/**
 * T must extend TypedTreeSchemaSpecification.
 * This can not be enforced using TypeScript since doing so breaks recursive type support.
 * See note on SchemaBuilder.fieldRecursive.
 */
export class TreeSchema<Name extends string = string, T = TypedTreeSchemaSpecification>
	implements ITreeSchema
{
	// Allows reading localFields through the normal map, but without losing type information.
	public readonly localFields: ObjectToMap<
		NormalizeLocalFields<Assume<T, TypedTreeSchemaSpecification>["local"]>,
		LocalFieldKey,
		FieldSchema
	>;

	public readonly localFieldsObject: NormalizeLocalFields<
		Assume<T, TypedTreeSchemaSpecification>["local"]
	>;

	public readonly globalFields!: ReadonlySet<GlobalFieldKey>;
	public readonly extraLocalFields: FieldSchema;
	public readonly extraGlobalFields: boolean;
	public readonly value: ValueSchema;

	public readonly name: Name & TreeSchemaIdentifier;

	public readonly info: Assume<T, TypedTreeSchemaSpecification>;

	public constructor(public readonly builder: Named<string>, name: Name, info: T) {
		this.info = info as Assume<T, TypedTreeSchemaSpecification>;
		this.name = name as Name & TreeSchemaIdentifier;
		this.localFieldsObject = normalizeLocalFields<
			Assume<T, TypedTreeSchemaSpecification>["local"]
		>(builder, this.info.local);
		this.localFields = objectToMap(this.localFieldsObject);
		this.extraLocalFields = normalizeField(this.info.extraLocalFields);
		this.extraGlobalFields = this.info.extraGlobalFields ?? false;
		this.value = this.info.value ?? ValueSchema.Nothing;
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
 * Convert FieldSchemaSpecification | undefined into FieldSchema
 */
type NormalizeField<T extends FieldSchemaSpecification | undefined> = FieldSchema<
	T extends undefined ? typeof forbidden : T extends FieldSchema<infer Kind> ? Kind : typeof value
>;

function normalizeLocalFields<T extends LocalFields | undefined>(
	builder: Named<string>,
	fields: T,
): NormalizeLocalFields<T> {
	if (fields === undefined) {
		return {} as unknown as NormalizeLocalFields<T>;
	}
	const out: Record<string, FieldSchema> = {};
	// eslint-disable-next-line no-restricted-syntax
	for (const key in fields) {
		if (Object.prototype.hasOwnProperty.call(fields, key)) {
			const element = fields[key];
			out[key] = normalizeField(element);
		}
	}
	return out as NormalizeLocalFields<T>;
}

function normalizeField<T extends FieldSchemaSpecification | undefined>(t: T): NormalizeField<T> {
	if (t instanceof FieldSchema) {
		return t as NormalizeField<T>;
	}
	if (t === undefined) {
		return new FieldSchema(forbidden, []) as unknown as NormalizeField<T>;
	}
	return new FieldSchema(value, t) as unknown as NormalizeField<T>;
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
export type LazyTreeSchema = TreeSchema | (() => TreeSchema);

export type NormalizedAllowedTypes = Any | readonly TreeSchema[];
export type NormalizedLazyAllowedTypes = Any | (() => TreeSchema)[];

/**
 * Types for use in fields.
 * TODO: maybe replace this with AllowedTypesParameter to lower concept/code count.
 */
export type AllowedTypes = Any | FlexList<TreeSchema>;

/**
 * Types for use in fields, for use as a variadic parameter.
 */
export type AllowedTypesParameter = [Any] | readonly LazyItem<TreeSchema>[];

/**
 * Convert AllowedTypes into NormalizedLazyAllowedTypes
 */
type NormalizeAllowedTypes<T extends AllowedTypes> = T extends Any
	? Any
	: FlexListToLazyArray<TreeSchema, T>;

export function normalizeAllowedTypes<T extends AllowedTypes>(t: T): NormalizeAllowedTypes<T> {
	if (t === Any) {
		return Any as NormalizeAllowedTypes<T>;
	}
	return normalizeFlexList(t) as NormalizeAllowedTypes<T>;
}

/**
 * Convert AllowedTypes into NormalizedLazyAllowedTypes
 */
export type NormalizeAllowedTypesParameter<T> = T extends [Any]
	? Any
	: FlexListToLazyArray<TreeSchema, T>;

export function normalizeAllowedTypesParameter<T extends AllowedTypesParameter>(
	t: T,
): NormalizeAllowedTypesParameter<T> {
	if (t.length === 1 && t[0] === Any) {
		return Any as NormalizeAllowedTypesParameter<T>;
	}
	// Note that this does not actually require full FlexList handling, since the input is always an array.
	// If removing the other uses of FlexList, simplify this to not require it.
	return normalizeFlexList(t) as NormalizeAllowedTypesParameter<T>;
}

export type FieldSchemaSpecification = AllowedTypes | FieldSchema;

/**
 * Object for capturing information about a TreeStoredSchema for use at both compile time and runtime.
 * @alpha
 */
export interface TypedTreeSchemaSpecification {
	readonly local?: { readonly [key: string]: FieldSchemaSpecification | undefined };
	readonly global?: FlexList<GlobalFieldSchema>;
	readonly extraLocalFields?: FieldSchemaSpecification;
	readonly extraGlobalFields?: boolean;
	readonly value?: ValueSchema;
}

export type Kinds = typeof FieldKinds[keyof typeof FieldKinds] | typeof forbidden;

/**
 * All policy for a specific field,
 * including functionality that does not have to be kept consistent across versions or deterministic.
 *
 * This can include policy for how to use this schema for "view" purposes, and well as how to expose editing APIs.
 * @sealed @alpha
 */
export class FieldSchema<Kind extends Kinds = Kinds, Types = AllowedTypes> implements IFieldSchema {
	protected _typeCheck?: MakeNominal;
	public constructor(public readonly kind: Kind, public readonly allowedTypes: Types) {}

	public get types(): TreeTypeSet {
		return allowedTypesToTypeSet(this.allowedTypes as unknown as AllowedTypes);
	}
}

/**
 * All policy for a specific field,
 * including functionality that does not have to be kept consistent across versions or deterministic.
 *
 * This can include policy for how to use this schema for "view" purposes, and well as how to expose editing APIs.
 * @sealed @alpha
 */
export class GlobalFieldSchema<
	Kind extends Kinds = Kinds,
	Types extends AllowedTypes = AllowedTypes,
> implements IFieldSchema
{
	public readonly symbol: GlobalFieldKeySymbol;
	protected _typeCheck?: MakeNominal;
	public constructor(
		public readonly builder: Named<string>,
		public readonly key: GlobalFieldKey,
		public readonly schema: FieldSchema<Kind, Types>,
	) {
		this.symbol = symbolFromKey(key);
	}

	public get kind(): Kind {
		return this.schema.kind;
	}

	public get types(): TreeTypeSet {
		return this.schema.types;
	}
}
