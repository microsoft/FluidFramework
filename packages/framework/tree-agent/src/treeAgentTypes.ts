/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { TreeNodeSchemaClass } from "@fluidframework/tree/alpha";
import { ObjectNodeSchema } from "@fluidframework/tree/alpha";

/**
 * Type kinds for the type factory type system.
 * @alpha
 */
export type TypeFactoryTypeKind =
	| "string"
	| "number"
	| "boolean"
	| "void"
	| "undefined"
	| "null"
	| "unknown"
	| "array"
	| "object"
	| "record"
	| "map"
	| "tuple"
	| "union"
	| "literal"
	| "optional"
	| "readonly"
	| "instanceof";

/**
 * Base interface for type factory types.
 * @alpha
 */
export interface TypeFactoryType {
	readonly _kind: TypeFactoryTypeKind;
}

/**
 * Set of valid type factory type kinds for efficient validation.
 * @internal
 */
const validTypeKinds: ReadonlySet<TypeFactoryTypeKind> = new Set<TypeFactoryTypeKind>([
	"string",
	"number",
	"boolean",
	"void",
	"undefined",
	"null",
	"unknown",
	"array",
	"object",
	"record",
	"map",
	"tuple",
	"union",
	"literal",
	"optional",
	"readonly",
	"instanceof",
]);

/**
 * Type guard to check if a value is a type factory type.
 * @alpha
 */
export function isTypeFactoryType(value: unknown): value is TypeFactoryType {
	if (typeof value !== "object" || value === null || !("_kind" in value)) {
		return false;
	}
	const kind = (value as { _kind: unknown })._kind;
	return typeof kind === "string" && validTypeKinds.has(kind as TypeFactoryTypeKind);
}

// Primitive type factories

/**
 * @alpha
 */
export interface TypeFactoryString extends TypeFactoryType {
	readonly _kind: "string";
}

/**
 * @alpha
 */
export interface TypeFactoryNumber extends TypeFactoryType {
	readonly _kind: "number";
}

/**
 * @alpha
 */
export interface TypeFactoryBoolean extends TypeFactoryType {
	readonly _kind: "boolean";
}

/**
 * @alpha
 */
export interface TypeFactoryVoid extends TypeFactoryType {
	readonly _kind: "void";
}

/**
 * @alpha
 */
export interface TypeFactoryUndefined extends TypeFactoryType {
	readonly _kind: "undefined";
}

/**
 * @alpha
 */
export interface TypeFactoryNull extends TypeFactoryType {
	readonly _kind: "null";
}

/**
 * @alpha
 */
export interface TypeFactoryUnknown extends TypeFactoryType {
	readonly _kind: "unknown";
}

// Complex type interfaces

/**
 * @alpha
 */
export interface TypeFactoryArray extends TypeFactoryType {
	readonly _kind: "array";
	readonly element: TypeFactoryType;
}

/**
 * @alpha
 */
export interface TypeFactoryObject extends TypeFactoryType {
	readonly _kind: "object";
	readonly shape: Record<string, TypeFactoryType>;
}

/**
 * @alpha
 */
export interface TypeFactoryRecord extends TypeFactoryType {
	readonly _kind: "record";
	readonly keyType: TypeFactoryType;
	readonly valueType: TypeFactoryType;
}

/**
 * @alpha
 */
export interface TypeFactoryMap extends TypeFactoryType {
	readonly _kind: "map";
	readonly keyType: TypeFactoryType;
	readonly valueType: TypeFactoryType;
}

/**
 * @alpha
 */
export interface TypeFactoryTuple extends TypeFactoryType {
	readonly _kind: "tuple";
	readonly items: readonly TypeFactoryType[];
	readonly rest?: TypeFactoryType;
}

/**
 * @alpha
 */
export interface TypeFactoryUnion extends TypeFactoryType {
	readonly _kind: "union";
	readonly options: readonly TypeFactoryType[];
}

/**
 * @alpha
 */
export interface TypeFactoryLiteral extends TypeFactoryType {
	readonly _kind: "literal";
	readonly value: string | number | boolean;
}

/**
 * @alpha
 */
export interface TypeFactoryOptional extends TypeFactoryType {
	readonly _kind: "optional";
	readonly innerType: TypeFactoryType;
}

/**
 * @alpha
 */
export interface TypeFactoryReadonly extends TypeFactoryType {
	readonly _kind: "readonly";
	readonly innerType: TypeFactoryType;
}

/**
 * @alpha
 */
export interface TypeFactoryInstanceOf extends TypeFactoryType {
	readonly _kind: "instanceof";
	readonly schema: ObjectNodeSchema;
}

/**
 * Namespace containing type factory functions.
 * @alpha
 */
export const typeFactory = {
	/**
	 * Create a string type.
	 * @alpha
	 */
	string(): TypeFactoryString {
		return { _kind: "string" };
	},

	/**
	 * Create a number type.
	 * @alpha
	 */
	number(): TypeFactoryNumber {
		return { _kind: "number" };
	},

	/**
	 * Create a boolean type.
	 * @alpha
	 */
	boolean(): TypeFactoryBoolean {
		return { _kind: "boolean" };
	},

	/**
	 * Create a void type.
	 * @alpha
	 */
	void(): TypeFactoryVoid {
		return { _kind: "void" };
	},

	/**
	 * Create an undefined type.
	 * @alpha
	 */
	undefined(): TypeFactoryUndefined {
		return { _kind: "undefined" };
	},

	/**
	 * Create a null type.
	 * @alpha
	 */
	null(): TypeFactoryNull {
		return { _kind: "null" };
	},

	/**
	 * Create an unknown type.
	 * @alpha
	 */
	unknown(): TypeFactoryUnknown {
		return { _kind: "unknown" };
	},

	/**
	 * Create an array type.
	 * @alpha
	 */
	array(element: TypeFactoryType): TypeFactoryArray {
		return { _kind: "array", element };
	},

	/**
	 * Create an object type.
	 * @alpha
	 */
	object(shape: Record<string, TypeFactoryType>): TypeFactoryObject {
		return { _kind: "object", shape };
	},

	/**
	 * Create a record type.
	 * @alpha
	 */
	record(keyType: TypeFactoryType, valueType: TypeFactoryType): TypeFactoryRecord {
		return { _kind: "record", keyType, valueType };
	},

	/**
	 * Create a map type.
	 * @alpha
	 */
	map(keyType: TypeFactoryType, valueType: TypeFactoryType): TypeFactoryMap {
		return { _kind: "map", keyType, valueType };
	},

	/**
	 * Create a tuple type.
	 * @alpha
	 */
	tuple(items: readonly TypeFactoryType[], rest?: TypeFactoryType): TypeFactoryTuple {
		if (items.length === 0 && rest === undefined) {
			throw new UsageError(
				"typeFactory.tuple requires at least one item or a rest type. Empty tuples are not supported.",
			);
		}
		return rest === undefined ? { _kind: "tuple", items } : { _kind: "tuple", items, rest };
	},

	/**
	 * Create a union type.
	 * @alpha
	 */
	union(options: readonly TypeFactoryType[]): TypeFactoryUnion {
		if (options.length === 0) {
			throw new UsageError(
				"typeFactory.union requires at least one option. Empty unions are not valid TypeScript types.",
			);
		}
		return { _kind: "union", options };
	},

	/**
	 * Create a literal type.
	 * @alpha
	 */
	literal(value: string | number | boolean): TypeFactoryLiteral {
		return { _kind: "literal", value };
	},

	/**
	 * Create an optional type.
	 * @alpha
	 */
	optional(innerType: TypeFactoryType): TypeFactoryOptional {
		return { _kind: "optional", innerType };
	},

	/**
	 * Create a readonly type.
	 * @alpha
	 */
	readonly(innerType: TypeFactoryType): TypeFactoryReadonly {
		return { _kind: "readonly", innerType };
	},

	/**
	 * Create an instanceOf type for a SharedTree schema class.
	 * @alpha
	 */
	instanceOf<T extends TreeNodeSchemaClass>(schema: T): TypeFactoryInstanceOf {
		if (!(schema instanceof ObjectNodeSchema)) {
			throw new UsageError(
				`typeFactory.instanceOf only supports ObjectNodeSchema-based schema classes (created via SchemaFactory.object). ` +
					`Pass a schema class that extends from an object schema (e.g., sf.object(...)), not primitive, array, or map schemas.`,
			);
		}
		const instanceOfType: TypeFactoryInstanceOf = {
			_kind: "instanceof",
			schema,
		};
		instanceOfsTypeFactory.set(instanceOfType, schema);
		return instanceOfType;
	},
};

/**
 * A lookup from type factory instanceOf types to their corresponding ObjectNodeSchema.
 * @alpha
 */
export const instanceOfsTypeFactory = new WeakMap<TypeFactoryInstanceOf, ObjectNodeSchema>();
