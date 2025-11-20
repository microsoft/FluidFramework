/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { assert } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { ImplicitFieldSchema, TreeNodeSchemaClass } from "@fluidframework/tree";
import type {
	InsertableContent,
	TreeNode,
	TreeNodeSchema,
	UnsafeUnknownSchema,
} from "@fluidframework/tree/alpha";
import {
	ArrayNodeSchema,
	MapNodeSchema,
	ObjectNodeSchema,
	RecordNodeSchema,
	TreeAlpha,
} from "@fluidframework/tree/alpha";
import { NodeKind, normalizeFieldSchema } from "@fluidframework/tree/internal";
import { z } from "zod";

/**
 * Subset of Map interface.
 *
 * @remarks originally from tree/src/util/utils.ts
 */
export interface MapGetSet<K, V> {
	get(key: K): V | undefined;
	set(key: K, value: V): void;
}

/**
 * TBD
 */
export function fail(message: string): never {
	throw new Error(message);
}

/**
 * Map one iterable to another by transforming each element one at a time
 * @param iterable - the iterable to transform
 * @param map - the transformation function to run on each element of the iterable
 * @returns a new iterable of elements which have been transformed by the `map` function
 *
 * @remarks originally from tree/src/util/utils.ts
 */
export function* mapIterable<T, U>(
	iterable: Iterable<T>,
	map: (t: T) => U,
): IterableIterator<U> {
	for (const t of iterable) {
		yield map(t);
	}
}

/**
 * Retrieve a value from a map with the given key, or create a new entry if the key is not in the map.
 * @param map - The map to query/update
 * @param key - The key to lookup in the map
 * @param defaultValue - a function which returns a default value. This is called and used to set an initial value for the given key in the map if none exists
 * @returns either the existing value for the given key, or the newly-created value (the result of `defaultValue`)
 *
 * @remarks originally from tree/src/util/utils.ts
 */
export function getOrCreate<K, V>(
	map: MapGetSet<K, V>,
	key: K,
	defaultValue: (key: K) => V,
): V {
	let value = map.get(key);
	if (value === undefined) {
		value = defaultValue(key);
		map.set(key, value);
	}
	return value;
}

/**
 * TODO
 */
export function tryGetSingleton<T>(set: ReadonlySet<T>): T | undefined {
	if (set.size === 1) {
		for (const item of set) {
			return item;
		}
	}
}

/**
 * Does it have at least two elements?
 */
export function hasAtLeastTwo<T>(array: T[]): array is [T, T, ...T[]] {
	return array.length >= 2;
}

/**
 * Include this property in a field's schema metadata to indicate that the field's value should be generated via a provided function rather than by the LLM.
 * @example
 * ```ts
 * class Object extends schemaFactory.object("Object", {
 *     created: sf.required(sf.number, {
 *         custom: {
 *             // The LLM will ignore this field, and instead it will be populated with the result of the function
 *             [llmDefault]: () => Date.now(),
 *         },
 *     }),
 * }) {};
 * ```
 * @alpha
 */
export const llmDefault = Symbol("tree-agent/llmDefault");
// TODO: make this a wrapper function instead, and hide the symbol.
// function llmDefault<T extends FieldSchemaMetadata>(metadata: T): T { ... }

/**
 * Usage fail
 */
export function failUsage(message: string): never {
	throw new UsageError(message);
}

/**
 * Construct an object node from a schema and value.
 */
export function constructNode(schema: TreeNodeSchema, value: InsertableContent): TreeNode {
	const node = TreeAlpha.create<UnsafeUnknownSchema>(schema, value);
	assert(
		node !== undefined && node !== null && typeof node === "object" && !isFluidHandle(node),
		0xc1e /* Expected a constructed node to be an object */,
	);
	return node;
}

/**
 * Returns the unqualified name of a tree value's schema (e.g. a node with schema identifier `"my.scope.MyNode"` returns `"MyNode"`).
 * @remarks If the schema is an inlined array, map, or record type, then it has no name and this function will return a string representation of the type (e.g., `"MyNode[]"` or `"Map<string, MyNode>"`).
 */
export function getFriendlyName(schema: TreeNodeSchema): string {
	if (schema.kind === NodeKind.Leaf || isNamedSchema(schema.identifier)) {
		return unqualifySchema(schema.identifier);
	}

	const childNames = Array.from(schema.childTypes, (t) => getFriendlyName(t));
	if (schema instanceof ArrayNodeSchema) {
		return childNames.length > 1 ? `(${childNames.join(" | ")})[]` : `${childNames[0]}[]`;
	}
	if (schema instanceof MapNodeSchema) {
		return childNames.length > 1
			? `Map<string, (${childNames.join(" | ")})>`
			: `Map<string, ${childNames[0]}>`;
	}
	if (schema instanceof RecordNodeSchema) {
		return childNames.length > 1
			? `Record<string, (${childNames.join(" | ")})>`
			: `Record<string, ${childNames[0]}>`;
	}
	fail("Unexpected node schema");
}

/**
 * Returns true if the schema identifier represents a named schema (object, named array, named map, or named record).
 * @remarks This does not include primitive schemas or inlined array/map/record schemas.
 */
export function isNamedSchema(schemaIdentifier: string): boolean {
	if (
		["string", "number", "boolean", "null", "handle"].includes(
			unqualifySchema(schemaIdentifier),
		)
	) {
		return false;
	}

	return schemaIdentifier.match(/(?:Array|Map|Record)<\["(.*)"]>/) === null;
}

/**
 * Returns the unqualified name of a schema (e.g. `"my.scope.MyNode"` returns `"MyNode"`).
 * @remarks This works by removing all characters before the last dot in the schema name.
 * If there is a dot in a user's schema name, this might produce unexpected results.
 */
export function unqualifySchema(schemaIdentifier: string): string {
	// Get the unqualified name by removing the scope (everything before the last dot).
	const matches = schemaIdentifier.match(/[^.]+$/);
	if (matches === null) {
		return schemaIdentifier; // Return the original name if it is unscoped.
	}
	return matches[0];
}

/**
 * Returns the TypeScript source code corresponding to a Zod schema. The schema is supplied as an object where each
 * property provides a name for an associated Zod type. The return value is a string containing the TypeScript source
 * code corresponding to the schema. Each property of the schema object is emitted as a named `interface` or `type`
 * declaration for the associated type and is referenced by that name in the emitted type declarations. Other types
 * referenced in the schema are emitted in their structural form.
 * @param schema - A schema object where each property provides a name for an associated Zod type.
 * @param details - Optional details about the schema. The fields will be set according to the details in the given schema.
 * @returns The TypeScript source code corresponding to the schema.
 */
export function formatZodType(type: z.ZodTypeAny): string {
	const writer = new ZodTypeWriter();
	writer.appendType(type);
	return writer.toString();
}

class ZodTypeWriter {
	private result = "";
	private startOfLine = true;
	private indent = 0;

	public appendType(type: z.ZodTypeAny, minPrecedence = TypePrecedence.Object): void {
		const shouldParenthesize = getTypePrecendece(type) < minPrecedence;
		if (shouldParenthesize) {
			this.append("(");
		}
		this.appendTypeDefinition(type);
		if (shouldParenthesize) {
			this.append(")");
		}
	}

	public toString(): string {
		return this.result;
	}

	private append(s: string): void {
		if (this.startOfLine) {
			this.result += "    ".repeat(this.indent);
			this.startOfLine = false;
		}
		this.result += s;
	}

	private appendNewLine(): void {
		this.append("\n");
		this.startOfLine = true;
	}

	private appendTypeDefinition(type: z.ZodTypeAny): void {
		switch (getTypeKind(type)) {
			case z.ZodFirstPartyTypeKind.ZodString: {
				this.append("string");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodNumber: {
				this.append("number");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodBoolean: {
				this.append("boolean");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodDate: {
				this.append("Date");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodUndefined: {
				this.append("undefined");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodNull: {
				this.append("null");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodUnknown: {
				this.append("unknown");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodArray: {
				this.appendArrayType(type);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodObject: {
				this.appendObjectType(type);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodUnion: {
				this.appendUnionOrIntersectionTypes(
					(type._def as z.ZodUnionDef).options,
					TypePrecedence.Union,
				);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion: {
				this.appendUnionOrIntersectionTypes(
					[...(type._def as z.ZodDiscriminatedUnionDef<string>).options.values()],
					TypePrecedence.Union,
				);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodIntersection: {
				this.appendUnionOrIntersectionTypes(
					[
						(type._def as z.ZodIntersectionDef).left,
						(type._def as z.ZodIntersectionDef).right,
					],
					TypePrecedence.Intersection,
				);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodTuple: {
				this.appendTupleType(type);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodRecord: {
				this.appendRecordType(type);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodMap: {
				this.appendMapType(type);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodLiteral: {
				this.appendLiteral((type._def as z.ZodLiteralDef).value);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodEnum: {
				this.append(
					(type._def as z.ZodEnumDef).values.map((value) => JSON.stringify(value)).join(" | "),
				);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodOptional: {
				this.appendUnionOrIntersectionTypes(
					[(type._def as z.ZodOptionalDef).innerType, z.undefined()],
					TypePrecedence.Union,
				);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodReadonly: {
				this.appendReadonlyType(type);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodEffects: {
				const schema = instanceOfs.get(type);
				if (schema === undefined) {
					throw new UsageError(
						`Unsupported zod effects type when formatting helper types: ${getTypeKind(type)}`,
					);
				}
				this.append(getFriendlyName(schema));
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodVoid: {
				this.append("void");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodLazy: {
				this.appendType((type._def as z.ZodLazyDef).getter());
				return;
			}
			default: {
				throw new UsageError(
					`Unsupported type when formatting helper types: ${getTypeKind(type)}`,
				);
			}
		}
	}

	private appendArrayType(arrayType: z.ZodTypeAny): void {
		this.appendType((arrayType._def as z.ZodArrayDef).type, TypePrecedence.Object);
		this.append("[]");
	}

	private appendObjectType(objectType: z.ZodTypeAny): void {
		this.append("{");
		this.appendNewLine();
		this.indent++;
		// eslint-disable-next-line prefer-const
		for (let [name, propertyType] of Object.entries(
			(objectType._def as z.ZodObjectDef).shape(),
		)) {
			this.append(name);
			if (getTypeKind(propertyType) === z.ZodFirstPartyTypeKind.ZodOptional) {
				this.append("?");
				propertyType = (propertyType._def as z.ZodOptionalDef).innerType;
			}
			this.append(": ");
			this.appendType(propertyType);
			this.append(";");
			this.appendNewLine();
		}
		this.indent--;
		this.append("}");
	}

	private appendUnionOrIntersectionTypes(
		types: readonly z.ZodTypeAny[],
		minPrecedence: TypePrecedence,
	): void {
		let first = true;
		for (const type of types) {
			if (!first) {
				this.append(minPrecedence === TypePrecedence.Intersection ? " & " : " | ");
			}
			this.appendType(type, minPrecedence);
			first = false;
		}
	}

	private appendTupleType(tupleType: z.ZodTypeAny): void {
		this.append("[");
		let first = true;
		for (const type of (tupleType._def as z.ZodTupleDef<z.ZodTupleItems, z.ZodType>).items) {
			if (!first) {
				this.append(", ");
			}
			if (getTypeKind(type) === z.ZodFirstPartyTypeKind.ZodOptional) {
				this.appendType((type._def as z.ZodOptionalDef).innerType, TypePrecedence.Object);
				this.append("?");
			} else {
				this.appendType(type);
			}
			first = false;
		}
		const rest = (tupleType._def as z.ZodTupleDef<z.ZodTupleItems, z.ZodType | null>).rest;
		if (rest !== null) {
			if (!first) {
				this.append(", ");
			}
			this.append("...");
			this.appendType(rest, TypePrecedence.Object);
			this.append("[]");
		}
		this.append("]");
	}

	private appendRecordType(recordType: z.ZodTypeAny): void {
		this.append("Record<");
		this.appendType((recordType._def as z.ZodRecordDef).keyType);
		this.append(", ");
		this.appendType((recordType._def as z.ZodRecordDef).valueType);
		this.append(">");
	}

	private appendMapType(mapType: z.ZodTypeAny): void {
		this.append("Map<");
		this.appendType((mapType._def as z.ZodMapDef).keyType);
		this.append(", ");
		this.appendType((mapType._def as z.ZodMapDef).valueType);
		this.append(">");
	}

	private appendLiteral(value: unknown): void {
		this.append(
			typeof value === "string" || typeof value === "number" || typeof value === "boolean"
				? JSON.stringify(value)
				: "any",
		);
	}

	private appendReadonlyType(readonlyType: z.ZodType): void {
		this.append("Readonly<");
		this.appendType((readonlyType._def as z.ZodReadonlyDef).innerType);
		this.append(">");
	}
}

function getTypeKind(type: z.ZodType): z.ZodFirstPartyTypeKind {
	return (type._def as z.ZodTypeDef & { typeName: z.ZodFirstPartyTypeKind }).typeName;
}

const enum TypePrecedence {
	Union = 0,
	Intersection = 1,
	Object = 2,
}

function getTypePrecendece(type: z.ZodType): TypePrecedence {
	switch (getTypeKind(type)) {
		case z.ZodFirstPartyTypeKind.ZodEnum:
		case z.ZodFirstPartyTypeKind.ZodUnion:
		case z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion: {
			return TypePrecedence.Union;
		}
		case z.ZodFirstPartyTypeKind.ZodIntersection: {
			return TypePrecedence.Intersection;
		}
		default: {
			return TypePrecedence.Object;
		}
	}
}

/**
 * Create a Zod schema for a SharedTree schema class.
 * @alpha
 */
export function instanceOf<T extends TreeNodeSchemaClass>(
	schema: T,
): z.ZodType<InstanceType<T>, z.ZodTypeDef, InstanceType<T>> {
	if (!(schema instanceof ObjectNodeSchema)) {
		throw new UsageError(`${schema.identifier} must be an instance of ObjectNodeSchema.`);
	}
	const effect = z.instanceof(schema);
	instanceOfs.set(effect, schema);
	return effect;
}

const instanceOfs = new WeakMap<z.ZodTypeAny, ObjectNodeSchema>();

/**
 * Adds all (optionally filtered) schemas reachable from the given schema to the given set.
 * @returns The set of schemas added (same as the `schemas` parameter, if supplied).
 */
export function findSchemas(
	schema: ImplicitFieldSchema,
	filter: (schema: TreeNodeSchema) => boolean = () => true,
	schemas = new Set<TreeNodeSchema>(),
): Set<TreeNodeSchema> {
	for (const nodeSchema of normalizeFieldSchema(schema).allowedTypeSet) {
		if (!schemas.has(nodeSchema)) {
			if (filter(nodeSchema)) {
				schemas.add(nodeSchema);
			}
			findSchemas([...nodeSchema.childTypes], filter, schemas);
		}
	}
	return schemas;
}

/**
 * De-capitalize (the first letter of) a string.
 */
export function communize(str: string): string {
	return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Stringify an unknown error value
 */
export function toErrorString(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}
