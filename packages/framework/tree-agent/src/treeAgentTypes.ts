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
	/**
	 * The kind of type this represents.
	 */
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
 * Represents a string type in the type factory system.
 * @alpha
 */
export interface TypeFactoryString extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "string";
}

/**
 * Represents a number type in the type factory system.
 * @alpha
 */
export interface TypeFactoryNumber extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "number";
}

/**
 * Represents a boolean type in the type factory system.
 * @alpha
 */
export interface TypeFactoryBoolean extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "boolean";
}

/**
 * Represents a void type in the type factory system.
 * @alpha
 */
export interface TypeFactoryVoid extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "void";
}

/**
 * Represents an undefined type in the type factory system.
 * @alpha
 */
export interface TypeFactoryUndefined extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "undefined";
}

/**
 * Represents a null type in the type factory system.
 * @alpha
 */
export interface TypeFactoryNull extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "null";
}

/**
 * Represents an unknown type in the type factory system.
 * @alpha
 */
export interface TypeFactoryUnknown extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "unknown";
}

// Complex type interfaces

/**
 * Represents an array type in the type factory system.
 * @alpha
 */
export interface TypeFactoryArray extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "array";
	/**
	 * The type of elements in the array.
	 */
	readonly element: TypeFactoryType;
}

/**
 * Represents an object type with a fixed shape in the type factory system.
 * @alpha
 */
export interface TypeFactoryObject extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "object";
	/**
	 * The shape of the object, mapping property names to their types.
	 */
	readonly shape: Record<string, TypeFactoryType>;
}

/**
 * Represents a record type (index signature) in the type factory system.
 * @alpha
 */
export interface TypeFactoryRecord extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "record";
	/**
	 * The type of the record's keys.
	 */
	readonly keyType: TypeFactoryType;
	/**
	 * The type of the record's values.
	 */
	readonly valueType: TypeFactoryType;
}

/**
 * Represents a Map type in the type factory system.
 * @alpha
 */
export interface TypeFactoryMap extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "map";
	/**
	 * The type of the map's keys.
	 */
	readonly keyType: TypeFactoryType;
	/**
	 * The type of the map's values.
	 */
	readonly valueType: TypeFactoryType;
}

/**
 * Represents a tuple type with fixed-length items and optional rest elements in the type factory system.
 * @alpha
 */
export interface TypeFactoryTuple extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "tuple";
	/**
	 * The fixed-length items in the tuple.
	 */
	readonly items: readonly TypeFactoryType[];
	/**
	 * Optional rest element type for variable-length tuples.
	 */
	readonly rest?: TypeFactoryType;
}

/**
 * Represents a union type in the type factory system.
 * @alpha
 */
export interface TypeFactoryUnion extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "union";
	/**
	 * The possible types in the union.
	 */
	readonly options: readonly TypeFactoryType[];
}

/**
 * Represents a literal type (specific string, number, or boolean value) in the type factory system.
 * @alpha
 */
export interface TypeFactoryLiteral extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "literal";
	/**
	 * The specific literal value.
	 */
	readonly value: string | number | boolean;
}

/**
 * Represents an optional type modifier in the type factory system.
 * @alpha
 */
export interface TypeFactoryOptional extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "optional";
	/**
	 * The inner type that is optional.
	 */
	readonly innerType: TypeFactoryType;
}

/**
 * Represents a readonly type modifier in the type factory system.
 * @alpha
 */
export interface TypeFactoryReadonly extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "readonly";
	/**
	 * The inner type that is readonly.
	 */
	readonly innerType: TypeFactoryType;
}

/**
 * Represents an instanceof type that references a SharedTree schema class in the type factory system.
 * @alpha
 */
export interface TypeFactoryInstanceOf extends TypeFactoryType {
	/**
	 * {@inheritDoc TypeFactoryType._kind}
	 */
	readonly _kind: "instanceof";
	/**
	 * The SharedTree schema class to reference.
	 */
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
