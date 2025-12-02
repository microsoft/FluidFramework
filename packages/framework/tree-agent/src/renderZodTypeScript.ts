/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { TreeNodeSchema, TreeNodeSchemaClass } from "@fluidframework/tree/alpha";
import { ObjectNodeSchema } from "@fluidframework/tree/alpha";
import { z } from "zod";

/**
 * Converts Zod schema definitions into TypeScript declaration text.
 */
export function renderZodTypeScript(
	zodType: z.ZodTypeAny,
	getFriendlyName: (schema: TreeNodeSchema) => string,
	instanceOfLookup: WeakMap<z.ZodTypeAny, ObjectNodeSchema>,
): string {
	let result = "";
	let startOfLine = true;
	let indent = 0;

	appendType(zodType);
	return result;

	function appendType(type: z.ZodTypeAny, minPrecedence = TypePrecedence.Object): void {
		const shouldParenthesize = getTypePrecendece(type) < minPrecedence;
		if (shouldParenthesize) {
			append("(");
		}
		appendTypeDefinition(type);
		if (shouldParenthesize) {
			append(")");
		}
	}

	function append(s: string): void {
		if (startOfLine) {
			result += "    ".repeat(indent);
			startOfLine = false;
		}
		result += s;
	}

	function appendNewLine(): void {
		append("\n");
		startOfLine = true;
	}

	function appendTypeDefinition(type: z.ZodTypeAny): void {
		switch (getTypeKind(type)) {
			case z.ZodFirstPartyTypeKind.ZodString: {
				append("string");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodNumber: {
				append("number");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodBoolean: {
				append("boolean");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodDate: {
				append("Date");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodUndefined: {
				append("undefined");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodNull: {
				append("null");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodUnknown: {
				append("unknown");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodArray: {
				appendArrayType(type);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodObject: {
				appendObjectType(type);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodUnion: {
				appendUnionOrIntersectionTypes(
					(type._def as z.ZodUnionDef).options,
					TypePrecedence.Union,
				);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion: {
				appendUnionOrIntersectionTypes(
					[...(type._def as z.ZodDiscriminatedUnionDef<string>).options.values()],
					TypePrecedence.Union,
				);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodIntersection: {
				appendUnionOrIntersectionTypes(
					[
						(type._def as z.ZodIntersectionDef).left,
						(type._def as z.ZodIntersectionDef).right,
					],
					TypePrecedence.Intersection,
				);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodTuple: {
				appendTupleType(type);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodRecord: {
				appendRecordType(type);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodMap: {
				appendMapType(type);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodLiteral: {
				appendLiteral((type._def as z.ZodLiteralDef).value);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodEnum: {
				append(
					(type._def as z.ZodEnumDef).values.map((value) => JSON.stringify(value)).join(" | "),
				);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodOptional: {
				appendUnionOrIntersectionTypes(
					[(type._def as z.ZodOptionalDef).innerType, z.undefined()],
					TypePrecedence.Union,
				);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodReadonly: {
				appendReadonlyType(type);
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodEffects: {
				const schema = instanceOfLookup.get(type);
				if (schema === undefined) {
					throw new UsageError(
						`Unsupported zod effects type when formatting helper types: ${getTypeKind(type)}`,
					);
				}
				append(getFriendlyName(schema));
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodVoid: {
				append("void");
				return;
			}
			case z.ZodFirstPartyTypeKind.ZodLazy: {
				appendType((type._def as z.ZodLazyDef).getter());
				return;
			}
			default: {
				throw new UsageError(
					`Unsupported type when formatting helper types: ${getTypeKind(type)}`,
				);
			}
		}
	}

	function appendArrayType(arrayType: z.ZodTypeAny): void {
		appendType((arrayType._def as z.ZodArrayDef).type, TypePrecedence.Object);
		append("[]");
	}

	function appendObjectType(objectType: z.ZodTypeAny): void {
		append("{");
		appendNewLine();
		indent++;
		for (const [name, entry] of Object.entries((objectType._def as z.ZodObjectDef).shape())) {
			let propertyType = entry;
			append(name);
			if (getTypeKind(propertyType) === z.ZodFirstPartyTypeKind.ZodOptional) {
				append("?");
				propertyType = (propertyType._def as z.ZodOptionalDef).innerType;
			}
			append(": ");
			appendType(propertyType);
			append(";");
			appendNewLine();
		}
		indent--;
		append("}");
	}

	function appendUnionOrIntersectionTypes(
		types: readonly z.ZodTypeAny[],
		minPrecedence: TypePrecedence,
	): void {
		let first = true;
		for (const innerType of types) {
			if (!first) {
				append(minPrecedence === TypePrecedence.Intersection ? " & " : " | ");
			}
			appendType(innerType, minPrecedence);
			first = false;
		}
	}

	function appendTupleType(tupleType: z.ZodTypeAny): void {
		append("[");
		let first = true;
		for (const innerType of (tupleType._def as z.ZodTupleDef<z.ZodTupleItems, z.ZodType>)
			.items) {
			if (!first) {
				append(", ");
			}
			if (getTypeKind(innerType) === z.ZodFirstPartyTypeKind.ZodOptional) {
				appendType((innerType._def as z.ZodOptionalDef).innerType, TypePrecedence.Object);
				append("?");
			} else {
				appendType(innerType);
			}
			first = false;
		}
		const rest = (tupleType._def as z.ZodTupleDef<z.ZodTupleItems, z.ZodType | null>).rest;
		if (rest !== null) {
			if (!first) {
				append(", ");
			}
			append("...");
			appendType(rest, TypePrecedence.Object);
			append("[]");
		}
		append("]");
	}

	function appendRecordType(recordType: z.ZodTypeAny): void {
		append("Record<");
		appendType((recordType._def as z.ZodRecordDef).keyType);
		append(", ");
		appendType((recordType._def as z.ZodRecordDef).valueType);
		append(">");
	}

	function appendMapType(mapType: z.ZodTypeAny): void {
		append("Map<");
		appendType((mapType._def as z.ZodMapDef).keyType);
		append(", ");
		appendType((mapType._def as z.ZodMapDef).valueType);
		append(">");
	}

	function appendLiteral(value: unknown): void {
		append(
			typeof value === "string" || typeof value === "number" || typeof value === "boolean"
				? JSON.stringify(value)
				: "any",
		);
	}

	function appendReadonlyType(readonlyType: z.ZodTypeAny): void {
		append("Readonly<");
		appendType((readonlyType._def as z.ZodReadonlyDef).innerType);
		append(">");
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

/**
 * A lookup from Zod instanceOf schemas to their corresponding ObjectNodeSchema.
 */
export const instanceOfs = new WeakMap<z.ZodTypeAny, ObjectNodeSchema>();
