/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { ObjectNodeSchema, TreeNodeSchema } from "@fluidframework/tree/alpha";

import type {
	TypeFactoryType,
	TypeFactoryArray,
	TypeFactoryObject,
	TypeFactoryTuple,
	TypeFactoryRecord,
	TypeFactoryMap,
	TypeFactoryLiteral,
	TypeFactoryOptional,
	TypeFactoryReadonly,
	TypeFactoryUnion,
} from "./treeAgentTypes.js";

export { instanceOfsTypeFactory } from "./treeAgentTypes.js";

/**
 * Converts type factory type definitions into TypeScript declaration text.
 * @alpha
 */
export function renderTypeFactoryTypeScript(
	typeFactoryType: TypeFactoryType,
	getFriendlyName: (schema: TreeNodeSchema) => string,
	instanceOfLookup: WeakMap<TypeFactoryType, ObjectNodeSchema>,
): string {
	let result = "";
	let startOfLine = true;
	let indent = 0;

	appendType(typeFactoryType, TypePrecedence.Union);
	return result;

	function appendType(type: TypeFactoryType, minPrecedence = TypePrecedence.Object): void {
		const shouldParenthesize = getTypePrecedence(type) < minPrecedence;
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

	function appendTypeDefinition(type: TypeFactoryType): void {
		switch (type._kind) {
			case "string": {
				append("string");
				return;
			}
			case "number": {
				append("number");
				return;
			}
			case "boolean": {
				append("boolean");
				return;
			}
			case "void": {
				append("void");
				return;
			}
			case "undefined": {
				append("undefined");
				return;
			}
			case "null": {
				append("null");
				return;
			}
			case "unknown": {
				append("unknown");
				return;
			}
			case "array": {
				appendArrayType(type as TypeFactoryArray);
				return;
			}
			case "object": {
				appendObjectType(type as TypeFactoryObject);
				return;
			}
			case "union": {
				appendUnionTypes((type as TypeFactoryUnion).options, TypePrecedence.Union);
				return;
			}
			case "tuple": {
				appendTupleType(type as TypeFactoryTuple);
				return;
			}
			case "record": {
				appendRecordType(type as TypeFactoryRecord);
				return;
			}
			case "map": {
				appendMapType(type as TypeFactoryMap);
				return;
			}
			case "literal": {
				appendLiteral((type as TypeFactoryLiteral).value);
				return;
			}
			case "optional": {
				appendUnionTypes(
					[(type as TypeFactoryOptional).innerType, { _kind: "undefined" }],
					TypePrecedence.Union,
				);
				return;
			}
			case "readonly": {
				appendReadonlyType(type as TypeFactoryReadonly);
				return;
			}
			case "instanceof": {
				const schema = instanceOfLookup.get(type);
				if (schema === undefined) {
					throw new UsageError(
						"instanceof type not found in lookup - this typically indicates the type was not created via typeFactory.instanceOf",
					);
				}
				append(getFriendlyName(schema));
				return;
			}
			default: {
				throw new UsageError(
					`Unsupported type when formatting helper types: ${String(type._kind ?? "unknown")}. Expected one of: string, number, boolean, void, undefined, null, unknown, array, object, union, tuple, record, map, literal, optional, readonly, instanceof.`,
				);
			}
		}
	}

	function appendArrayType(arrayType: TypeFactoryArray): void {
		appendType(arrayType.element, TypePrecedence.Object);
		append("[]");
	}

	function appendObjectType(objectType: TypeFactoryObject): void {
		append("{");
		appendNewLine();
		indent++;
		for (const [name, propertyType] of Object.entries(objectType.shape)) {
			append(name);
			if (propertyType._kind === "optional") {
				append("?");
				append(": ");
				appendType((propertyType as TypeFactoryOptional).innerType);
			} else {
				append(": ");
				appendType(propertyType);
			}
			append(";");
			appendNewLine();
		}
		indent--;
		append("}");
	}

	function appendUnionTypes(
		types: readonly TypeFactoryType[],
		minPrecedence: TypePrecedence,
	): void {
		let first = true;
		for (const innerType of types) {
			if (!first) {
				append(" | ");
			}
			appendType(innerType, minPrecedence);
			first = false;
		}
	}

	function appendTupleType(tupleType: TypeFactoryTuple): void {
		append("[");
		let first = true;
		for (const innerType of tupleType.items) {
			if (!first) {
				append(", ");
			}
			if (innerType._kind === "optional") {
				appendType((innerType as TypeFactoryOptional).innerType, TypePrecedence.Object);
				append("?");
			} else {
				appendType(innerType);
			}
			first = false;
		}
		if (tupleType.rest !== undefined) {
			if (!first) {
				append(", ");
			}
			append("...");
			appendType(tupleType.rest, TypePrecedence.Object);
			append("[]");
		}
		append("]");
	}

	function appendRecordType(recordType: TypeFactoryRecord): void {
		append("Record<");
		appendType(recordType.keyType, TypePrecedence.Union);
		append(", ");
		appendType(recordType.valueType, TypePrecedence.Union);
		append(">");
	}

	function appendMapType(mapType: TypeFactoryMap): void {
		append("Map<");
		appendType(mapType.keyType, TypePrecedence.Union);
		append(", ");
		appendType(mapType.valueType, TypePrecedence.Union);
		append(">");
	}

	function appendLiteral(value: string | number | boolean): void {
		append(JSON.stringify(value));
	}

	function appendReadonlyType(readonlyType: TypeFactoryReadonly): void {
		append("Readonly<");
		appendType(readonlyType.innerType);
		append(">");
	}
}

const enum TypePrecedence {
	Union = 0,
	Intersection = 1,
	Object = 2,
}

function getTypePrecedence(type: TypeFactoryType): TypePrecedence {
	switch (type._kind) {
		case "union": {
			return TypePrecedence.Union;
		}
		default: {
			return TypePrecedence.Object;
		}
	}
}
