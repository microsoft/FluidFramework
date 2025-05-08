/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { ImplicitFieldSchema } from "@fluidframework/tree";
import type {
	InsertableContent,
	InternalTreeNode,
	TreeNode,
	TreeNodeSchema,
	TreeViewAlpha,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/alpha";
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
 * @alpha
 */
export type TreeView<TRoot extends ImplicitFieldSchema> = Pick<
	TreeViewAlpha<TRoot>,
	"root" | "fork" | "merge" | "schema" | "events"
>;

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
	// TODO:#34138: Until this bug is fixed, we need to use the constructor kludge.
	// TODO:#34139: Until this bug is fixed, we need to use the constructor kludge.
	// return (
	// 	TreeAlpha.create<UnsafeUnknownSchema>(schema, value) ?? fail("Expected node to be created")
	// );

	return typeof schema === "function"
		? new schema(value as unknown as InternalTreeNode)
		: (schema as { create(data: InsertableContent): TreeNode }).create(value);
}

/**
 * TODO
 * @remarks Returns undefined if the schema should not be included in the prompt (and therefore should not ever be seen by the LLM).
 */
export function getFriendlySchemaName(schemaName: string): string | undefined {
	// TODO: Kludge
	const arrayTypes = schemaName.match(/Array<\["(.*)"]>/);
	if (arrayTypes?.[1] !== undefined) {
		return undefined;
	}

	const matches = schemaName.match(/[^.]+$/);
	if (matches === null) {
		// empty scope
		return schemaName;
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
 * @returns The TypeScript source code corresponding to the schema.
 */
export function getZodSchemaAsTypeScript(schema: Record<string, z.ZodType>): string {
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
					(type._def as z.ZodUnionDef).options,
					TypePrecedence.Intersection,
				);
			}
			case z.ZodFirstPartyTypeKind.ZodTuple: {
				return appendTupleType(type);
			}
			case z.ZodFirstPartyTypeKind.ZodRecord: {
				return appendRecordType(type);
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
			default: {
				append("any");
			}
		}
		append("any");
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
			// Special handling of methods on objects
			const method = (type as unknown as { method: object | undefined }).method;
			if (method !== undefined && method instanceof FunctionWrapper) {
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
			} else {
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
			}
			appendNewLine();
		}
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
