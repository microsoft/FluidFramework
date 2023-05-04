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
import { forbidden } from "../../defaultFieldKinds";
import { MakeNominal } from "../../../util";
import { FlexList, LazyItem, normalizeFlexList } from "./flexList";
import { Assume, ObjectToMap, WithDefault, objectToMap } from "./typeUtils";
import { RecursiveTreeSchemaSpecification } from "./schemaBuilder";
import { emptyField } from "./buildViewSchemaCollection";

// TODO: tests for this file

interface LocalFields {
	readonly [key: string]: FieldSchema;
}

type NormalizeLocalFieldsInner<T extends LocalFields> = {
	[Property in keyof T]: NormalizeField<T[Property]>;
};

type NormalizeLocalFields<T extends LocalFields | undefined> = NormalizeLocalFieldsInner<
	WithDefault<T, Record<string, never>>
>;

/**
 * T must extend TreeSchemaSpecification.
 * This can not be enforced using TypeScript since doing so breaks recursive type support.
 * See note on SchemaBuilder.fieldRecursive.
 */
export class TreeSchema<
	Name extends string = string,
	T extends RecursiveTreeSchemaSpecification = TreeSchemaSpecification,
> implements ITreeSchema
{
	// Allows reading localFields through the normal map, but without losing type information.
	public readonly localFields: ObjectToMap<
		NormalizeLocalFields<Assume<T, TreeSchemaSpecification>["local"]>,
		LocalFieldKey,
		FieldSchema
	>;

	public readonly localFieldsObject: NormalizeLocalFields<
		Assume<T, TreeSchemaSpecification>["local"]
	>;

	public readonly extraLocalFields: FieldSchema;
	public readonly extraGlobalFields: boolean;
	public readonly value: WithDefault<
		Assume<T, TreeSchemaSpecification>["value"],
		ValueSchema.Nothing
	>;

	public readonly name: Name & TreeSchemaIdentifier;

	public readonly info: Assume<T, TreeSchemaSpecification>;

	public constructor(public readonly builder: Named<string>, name: Name, info: T) {
		this.info = info as Assume<T, TreeSchemaSpecification>;
		this.name = name as Name & TreeSchemaIdentifier;
		this.localFieldsObject = normalizeLocalFields<Assume<T, TreeSchemaSpecification>["local"]>(
			this.info.local,
		);
		this.localFields = objectToMap(this.localFieldsObject);
		this.extraLocalFields = normalizeField(this.info.extraLocalFields);
		this.extraGlobalFields = this.info.extraGlobalFields ?? false;
		this.value = (this.info.value ?? ValueSchema.Nothing) as WithDefault<
			Assume<T, TreeSchemaSpecification>["value"],
			ValueSchema.Nothing
		>;
	}

	// TODO: determine if this needs to be lazy. If not, remove flex list and initialize in constructor.
	// If this does need to be lazy, maybe cache result?
	public get globalFields(): ReadonlySet<GlobalFieldKey> {
		if (this.info.global === undefined) {
			return new Set();
		}
		const normalized = normalizeFlexList(this.info.global);
		const mapped = normalized.map((f) => f().key);
		return new Set(mapped);
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
type NormalizeField<T extends FieldSchema | undefined> = T extends FieldSchema
	? T
	: typeof emptyField;

function normalizeLocalFields<T extends LocalFields | undefined>(
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

function normalizeField<T extends FieldSchema | undefined>(t: T): NormalizeField<T> {
	if (t === undefined) {
		return emptyField as unknown as NormalizeField<T>;
	}

	assert(t instanceof FieldSchema, "invalid FieldSchema");
	return t as NormalizeField<T>;
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
 *
 * "Any" is boxed in an array to allow use as variadic parameter.
 */
export type AllowedTypes = [Any] | readonly LazyItem<TreeSchema>[];

export function allowedTypesIsAny(t: AllowedTypes): t is [Any] {
	return t.length === 1 && t[0] === Any;
}

/**
 * Object for capturing information about a TreeStoredSchema for use at both compile time and runtime.
 * @alpha
 */
export interface TreeSchemaSpecification {
	readonly local?: { readonly [key: string]: FieldSchema };
	readonly global?: FlexList<GlobalFieldSchema>;
	readonly extraLocalFields?: FieldSchema;
	readonly extraGlobalFields?: boolean;
	readonly value?: ValueSchema;
}

export type FieldKindTypes = typeof FieldKinds[keyof typeof FieldKinds] | typeof forbidden;

/**
 * All policy for a specific field,
 * including functionality that does not have to be kept consistent across versions or deterministic.
 *
 * This can include policy for how to use this schema for "view" purposes, and well as how to expose editing APIs.
 * @sealed @alpha
 */
export class FieldSchema<Kind extends FieldKindTypes = FieldKindTypes, Types = AllowedTypes>
	implements IFieldSchema
{
	protected _typeCheck?: MakeNominal;
	public constructor(public readonly kind: Kind, public readonly allowedTypes: Types) {}

	public get types(): TreeTypeSet {
		return allowedTypesToTypeSet(this.allowedTypes as unknown as AllowedTypes);
	}
}

// TODO: maybe remove the need for this here? Just use AllowedTypes in view schema?
export function allowedTypesToTypeSet(t: AllowedTypes): TreeTypeSet {
	if (allowedTypesIsAny(t)) {
		return undefined;
	}
	const list: readonly (() => TreeSchema)[] = normalizeFlexList(t);
	const names = list.map((f) => f().name);
	return new Set(names);
}

/**
 * All policy for a specific field,
 * including functionality that does not have to be kept consistent across versions or deterministic.
 *
 * This can include policy for how to use this schema for "view" purposes, and well as how to expose editing APIs.
 * @sealed @alpha
 */
export class GlobalFieldSchema<
	Kind extends FieldKindTypes = FieldKindTypes,
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
