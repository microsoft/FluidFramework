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
	TreeBranch,
	TreeNode,
	TreeNodeSchema,
	TreeViewAlpha,
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

import { FunctionWrapper } from "./methodBinding.js";

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
 * @param defaultValue - a function which returns a default value.
 * This is called and used to set an initial value for the given key in the map if none exists
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
 * @alpha
 * @privateRemarks
 * This is a subset of the TreeViewAlpha functionality because if take it wholesale,
 * it causes problems with invariance of the generic parameters.
 */
export type TreeView<TRoot extends ImplicitFieldSchema | UnsafeUnknownSchema> = Pick<
	TreeViewAlpha<TRoot>,
	"root" | "fork" | "merge" | "rebaseOnto" | "schema" | "events"
> &
	TreeBranch;

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
 * Include this property in a field's schema metadata to indicate that the field's value should be generated
 * via a provided function rather than by the LLM.
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
 * Returns the unqualified name of a tree value's schema
 * (e.g. a node with schema identifier `"my.scope.MyNode"` returns `"MyNode"`).
 * @remarks
 * If the schema is an inlined array, map, or record type, then it has no name and this function will return
 * a string representation of the type (e.g., `"MyNode[]"` or `"Map<string, MyNode>"`).
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
 * Details about the properties of a TypeScript schema represented as Zod.
 */
export interface SchemaDetails {
	hasHelperMethods: boolean;
}

// TODO: yuck, this entire file has too many statics. we should rewrite it as a generic zod schema walk.
let detailsI: SchemaDetails = {
	hasHelperMethods: false,
};

/**
 * Returns the TypeScript source code corresponding to a Zod schema. The schema is supplied as an object where each
 * property provides a name for an associated Zod type. The return value is a string containing the TypeScript source
 * code corresponding to the schema. Each property of the schema object is emitted as a named `interface` or `type`
 * declaration for the associated type and is referenced by that name in the emitted type declarations. Other types
 * referenced in the schema are emitted in their structural form.
 * @param schema - A schema object where each property provides a name for an associated Zod type.
 * @param details - Optional details about the schema.
 * The fields will be set according to the details in the given schema.
 * @returns The TypeScript source code corresponding to the schema.
 */
export function getZodSchemaAsTypeScript(
	schema: Record<string, z.ZodType>,
	details?: SchemaDetails,
): string {
	detailsI = details ?? { hasHelperMethods: false };
	let result = "";
	let startOfLine = true;
	let indent = 0;
	const entries = [...Object.entries(schema)];
	const namedTypes = new Map<object, string>(
		entries.map(([name, type]) => [getTypeIdentity(type), name]),
	);
	for (const [name, type] of entries) {
		if (result) {
			appendNewLine();
		}
		const description = type._def.description;
		if (description !== undefined && description !== "") {
			for (const comment of description.split("\n")) {
				append(`// ${comment}`);
				appendNewLine();
			}
		}
		if (getTypeKind(type) === z.ZodFirstPartyTypeKind.ZodObject) {
			append(`interface ${name} `);
			appendObjectType(type as z.ZodObject<z.ZodRawShape>);
		} else {
			append(`type ${name} = `);
			appendTypeDefinition(type);
			append(";");
		}
		appendNewLine();
	}
	return result;

	function append(s: string) {
		if (startOfLine) {
			result += "    ".repeat(indent);
			startOfLine = false;
		}
		result += s;
	}

	function appendNewLine() {
		append("\n");
		startOfLine = true;
	}

	function appendType(type: z.ZodType, minPrecedence = TypePrecedence.Object) {
		const name = namedTypes.get(getTypeIdentity(type));
		if (name === undefined) {
			const parenthesize = getTypePrecendece(type) < minPrecedence;
			if (parenthesize) append("(");
			appendTypeDefinition(type);
			if (parenthesize) append(")");
		} else {
			append(name);
		}
	}

	function appendTypeDefinition(type: z.ZodType) {
		switch (getTypeKind(type)) {
			case z.ZodFirstPartyTypeKind.ZodString: {
				return append("string");
			}
			case z.ZodFirstPartyTypeKind.ZodNumber: {
				return append("number");
			}
			case z.ZodFirstPartyTypeKind.ZodBoolean: {
				return append("boolean");
			}
			case z.ZodFirstPartyTypeKind.ZodDate: {
				return append("Date");
			}
			case z.ZodFirstPartyTypeKind.ZodUndefined: {
				return append("undefined");
			}
			case z.ZodFirstPartyTypeKind.ZodNull: {
				return append("null");
			}
			case z.ZodFirstPartyTypeKind.ZodUnknown: {
				return append("unknown");
			}
			case z.ZodFirstPartyTypeKind.ZodArray: {
				return appendArrayType(type);
			}
			case z.ZodFirstPartyTypeKind.ZodObject: {
				return appendObjectType(type);
			}
			case z.ZodFirstPartyTypeKind.ZodUnion: {
				return appendUnionOrIntersectionTypes(
					(type._def as z.ZodUnionDef).options,
					TypePrecedence.Union,
				);
			}
			case z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion: {
				return appendUnionOrIntersectionTypes(
					[...(type._def as z.ZodDiscriminatedUnionDef<string>).options.values()],
					TypePrecedence.Union,
				);
			}
			case z.ZodFirstPartyTypeKind.ZodIntersection: {
				return appendUnionOrIntersectionTypes(
					[
						(type._def as z.ZodIntersectionDef).left,
						(type._def as z.ZodIntersectionDef).right,
					],
					TypePrecedence.Intersection,
				);
			}
			case z.ZodFirstPartyTypeKind.ZodTuple: {
				return appendTupleType(type);
			}
			case z.ZodFirstPartyTypeKind.ZodRecord: {
				return appendRecordType(type);
			}
			case z.ZodFirstPartyTypeKind.ZodMap: {
				return appendMapType(type);
			}
			case z.ZodFirstPartyTypeKind.ZodLiteral: {
				return appendLiteral((type._def as z.ZodLiteralDef).value);
			}
			case z.ZodFirstPartyTypeKind.ZodEnum: {
				return append(
					(type._def as z.ZodEnumDef).values.map((value) => JSON.stringify(value)).join(" | "),
				);
			}
			case z.ZodFirstPartyTypeKind.ZodOptional: {
				return appendUnionOrIntersectionTypes(
					[(type._def as z.ZodOptionalDef).innerType, z.undefined()],
					TypePrecedence.Union,
				);
			}
			case z.ZodFirstPartyTypeKind.ZodReadonly: {
				return appendReadonlyType(type);
			}
			case z.ZodFirstPartyTypeKind.ZodEffects: {
				// Currently, this only handles schema class instances, but there are other cases in which a ZodEffects
				// could theoretically be used.
				if (instanceOfs.has(type)) {
					const objectNodeSchema = instanceOfs.get(type);
					if (objectNodeSchema === undefined) {
						throw new UsageError(
							`Unsupported zod effects type when transforming class method: ${getTypeKind(type)}`,
						);
					}
					return append(getFriendlyName(objectNodeSchema));
				}
				throw new Error(
					"Unsupported zod effects type. " +
					"Did you use z.instanceOf? Use ExposedMethods.instanceOf function to reference schema classes in methods.",
				);
			}
			case z.ZodFirstPartyTypeKind.ZodVoid: {
				return append("void");
			}
			case z.ZodFirstPartyTypeKind.ZodLazy: {
				return appendType((type._def as z.ZodLazyDef).getter());
			}
			default: {
				throw new UsageError(
					`Unsupported type when transforming class method: ${getTypeKind(type)}`,
				);
			}
		}
	}

	function appendBoundMethods(boundType: z.ZodType): void {
		// eslint-disable-next-line prefer-const
		for (let [name, type] of Object.entries((boundType._def as z.ZodObjectDef).shape())) {
			// Special handling of methods on objects
			const method = (type as unknown as { method: object | undefined }).method;
			if (method !== undefined && method instanceof FunctionWrapper) {
				detailsI.hasHelperMethods = true;
				append(name);
				append("(");
				let first = true;
				for (const [argName, argType] of method.args) {
					if (!first) append(", ");
					if (getTypeKind(argType) === z.ZodFirstPartyTypeKind.ZodOptional) {
						append(`${argName}?: `);
						appendType((argType._def as z.ZodOptionalDef).innerType, TypePrecedence.Object);
					} else {
						append(`${argName}: `);
						appendType(argType);
					}
					first = false;
				}
				if (method.rest !== null) {
					if (!first) append(", ");
					append("...rest: ");
					appendType(method.rest, TypePrecedence.Object);
					append("[]");
				}
				append(`): `);
				appendType(method.returns, TypePrecedence.Object);
				append(";");
				if (method.description !== undefined) {
					append(` // ${method.description}`);
				}
				appendNewLine();
			}
		}
	}

	function appendArrayType(arrayType: z.ZodType) {
		appendType((arrayType._def as z.ZodArrayDef).type, TypePrecedence.Object);
		append("[]");
	}

	function appendObjectType(objectType: z.ZodType) {
		append("{");
		appendNewLine();
		indent++;
		// eslint-disable-next-line prefer-const
		for (let [name, type] of Object.entries((objectType._def as z.ZodObjectDef).shape())) {
			const method = (type as unknown as { method: object | undefined }).method;
			if (method === undefined || !(method instanceof FunctionWrapper)) {
				append(name);
				if (getTypeKind(type) === z.ZodFirstPartyTypeKind.ZodOptional) {
					append("?");
					type = (type._def as z.ZodOptionalDef).innerType;
				}
				append(": ");
				appendType(type);
				append(";");
				const comment = type.description;
				if (comment !== undefined && comment !== "") append(` // ${comment}`);
				appendNewLine();
			}
		}
		appendBoundMethods(objectType);
		indent--;
		append("}");
	}

	function appendUnionOrIntersectionTypes(
		types: readonly z.ZodType[],
		minPrecedence: TypePrecedence,
	) {
		let first = true;
		for (const type of types) {
			if (!first) append(minPrecedence === TypePrecedence.Intersection ? " & " : " | ");
			appendType(type, minPrecedence);
			first = false;
		}
	}

	function appendTupleType(tupleType: z.ZodType) {
		append("[");
		let first = true;
		for (const type of (tupleType._def as z.ZodTupleDef<z.ZodTupleItems, z.ZodType>).items) {
			if (!first) append(", ");
			if (getTypeKind(type) === z.ZodFirstPartyTypeKind.ZodOptional) {
				appendType((type._def as z.ZodOptionalDef).innerType, TypePrecedence.Object);
				append("?");
			} else {
				appendType(type);
			}
			first = false;
		}
		const rest = (tupleType._def as z.ZodTupleDef<z.ZodTupleItems, z.ZodType | null>).rest;
		if (rest !== null) {
			if (!first) append(", ");
			append("...");
			appendType(rest, TypePrecedence.Object);
			append("[]");
		}
		append("]");
	}

	function appendRecordType(recordType: z.ZodType) {
		append("Record<");
		appendType((recordType._def as z.ZodRecordDef).keyType);
		append(", ");
		appendType((recordType._def as z.ZodRecordDef).valueType);
		append(">");
	}

	function appendMapType(mapType: z.ZodType) {
		append("Map<");
		appendType((mapType._def as z.ZodMapDef).keyType);
		append(", ");
		appendType((mapType._def as z.ZodMapDef).valueType);
		append(">");
	}

	function appendLiteral(value: unknown) {
		append(
			typeof value === "string" || typeof value === "number" || typeof value === "boolean"
				? JSON.stringify(value)
				: "any",
		);
	}

	function appendReadonlyType(readonlyType: z.ZodType) {
		append("Readonly<");
		appendType((readonlyType._def as z.ZodReadonlyDef).innerType);
		append(">");
	}
}

function getTypeKind(type: z.ZodType): z.ZodFirstPartyTypeKind {
	return (type._def as z.ZodTypeDef & { typeName: z.ZodFirstPartyTypeKind }).typeName;
}

function getTypeIdentity(type: z.ZodType): object {
	switch (getTypeKind(type)) {
		case z.ZodFirstPartyTypeKind.ZodObject: {
			return (type._def as z.ZodObjectDef).shape();
		}
		case z.ZodFirstPartyTypeKind.ZodEnum: {
			return (type._def as z.ZodEnumDef).values;
		}
		case z.ZodFirstPartyTypeKind.ZodUnion: {
			return (type._def as z.ZodUnionDef).options;
		}
		default: {
			return type;
		}
	}
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
 * Adds all named object, map, array, and record schemas reachable from the given schema to the given set.
 * @remarks This includes transitive child/descendant schemas.
 * It does not include primitive schemas or inlined array/map/record schemas.
 * @returns The set of named schemas added (same as the `schemas` parameter, if supplied).
 */
export function findNamedSchemas(
	schema: ImplicitFieldSchema,
	schemas = new Set<TreeNodeSchema>(),
): Set<TreeNodeSchema> {
	const set = schemas ?? new Set();
	for (const nodeSchema of normalizeFieldSchema(schema).allowedTypeSet) {
		if (!set.has(nodeSchema)) {
			if (isNamedSchema(nodeSchema.identifier)) {
				set.add(nodeSchema);
			}
			findNamedSchemas([...nodeSchema.childTypes], set);
		}
	}
	return set;
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
