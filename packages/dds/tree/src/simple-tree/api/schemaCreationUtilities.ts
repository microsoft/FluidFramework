/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { assert, fail } from "@fluidframework/core-utils/internal";

import type { SchemaFactory, ScopedSchemaName } from "./schemaFactory.js";
import type {
	NodeFromSchema,
	InternalTreeNode,
	NodeKind,
	TreeNode,
	TreeNodeSchema,
	TreeNodeSchemaClass,
} from "../core/index.js";
import type { UnionToTuple } from "../../util/index.js";

/*
 * This file does two things:
 *
 * 1. Provides tools for making schema for cases like enums.
 *
 * 2. Demonstrates the kinds of schema utilities apps can write.
 * Nothing in here needs access to package internal APIs.
 */

/**
 * Create a schema for a node with no state.
 * @remarks
 * This is commonly used in unions when the only information needed is which kind of node the value is.
 * Enums are a common example of this pattern.
 * @see {@link adaptEnum}
 * @beta
 */
// Return type is intentionally derived.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function singletonSchema<TScope extends string, TName extends string | number>(
	factory: SchemaFactory<TScope, TName>,
	name: TName,
) {
	class SingletonSchema extends factory.object(name, {}) {
		public constructor(data?: InternalTreeNode | Record<string, never>) {
			super(data ?? {});
		}
		public get value(): TName {
			return name;
		}

		public static override toString(): string {
			return `SingletonSchema(${name})`;
		}

		public static [Symbol.toStringTag] = `SingletonSchema(${name})`;
	}

	type SingletonNodeType = TreeNode & { readonly value: TName };

	// Returning SingletonSchema without a type conversion results in TypeScript generating something like `readonly "__#124291@#brand": unknown;`
	// for the private brand field of TreeNode.
	// This numeric id doesn't seem to be stable over incremental builds, and thus causes diffs in the API extractor reports.
	// This is avoided by doing this type conversion.
	// The conversion is done via assignment instead of `as` to get stronger type safety.
	const toReturn: TreeNodeSchemaClass<
		ScopedSchemaName<TScope, TName>,
		NodeKind.Object,
		SingletonNodeType,
		Record<string, never>,
		true,
		Record<string, never>,
		undefined
	> = SingletonSchema;

	return toReturn;
}

/**
 * Converts an enum into a collection of schema which can be used in a union.
 *
 * @typeParam TScope - The scope of the provided factory.
 * There is a known issue where if a factory is provided that is typed as a {@link SchemaFactoryAlpha}, and its scope contains a "." character,
 * the inferred type for the scope will end up as a union of the scope up to the first "." character and the scope as it should be.
 * This can be mitigated by explicitly providing the TScope type parameter or by typing the provided factory as a {@link SchemaFactory} instead of a {@link SchemaFactoryAlpha}.
 *
 * @remarks
 * The string value of the enum is used as the name of the schema: callers must ensure that it is stable and unique.
 * Numeric enums values have the value implicitly converted into a string.
 * Consider making a dedicated schema factory with a nested scope (for example using {@link SchemaFactoryAlpha.scopedFactory}) to avoid the enum members colliding with other schema.
 * @example
 * ```typescript
 * const schemaFactory = new SchemaFactory("com.myApp");
 * // An enum for use in the tree. Must have string keys.
 * enum Mode {
 * 	a = "A",
 * 	b = "B",
 * }
 * // Define the schema for each member of the enum using a nested scope to group them together.
 * const ModeNodes = adaptEnum(new SchemaFactory(`${schemaFactory.scope}.Mode`), Mode);
 * // Defined the types of the nodes which correspond to this the schema.
 * type ModeNodes = TreeNodeFromImplicitAllowedTypes<(typeof ModeNodes.schema)>;
 * // An example schema which has an enum as a child.
 * class Parent extends schemaFactory.object("Parent", {
 * 	// adaptEnum's return value has a ".schema" property can be use as an `AllowedTypes` array allowing any of the members of the enum.
 * 	mode: ModeNodes.schema,
 * }) {}
 *
 * // Example usage of enum based nodes, showing what type to use and that `.value` can be used to read out the enum value.
 * function getValue(node: ModeNodes): Mode {
 * 	return node.value;
 * }
 *
 * // Example constructing a tree containing an enum node from an enum value.
 * // The syntax `new ModeNodes.a()` is also supported.
 * function setValue(node: Parent): void {
 * 	node.mode = ModeNodes(Mode.a);
 * }
 * ```
 * @privateRemarks
 * TODO: AB#43345: see TScope known issue above, and other references to this work item.
 *
 * @see {@link enumFromStrings} for a similar function that works on arrays of strings instead of an enum.
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function adaptEnum<
	TScope extends string,
	const TEnum extends Record<string, string | number>,
>(factory: SchemaFactory<TScope>, members: TEnum) {
	type Values = TEnum[keyof TEnum];
	const values = Object.values(members) as Values[];
	const inverse = new Map(Object.entries(members).map(([key, value]) => [value, key])) as Map<
		Values,
		keyof TEnum
	>;

	if (inverse.size !== values.length) {
		throw new UsageError("All members of enums must have distinct values.");
	}

	type TOut = {
		readonly [Property in keyof TEnum]: ReturnType<
			typeof singletonSchema<TScope, TEnum[Property]>
		>;
	};

	type SchemaArray = UnionToTuple<TOut[keyof TEnum]>;
	const schemaArray: TreeNodeSchema[] = [];

	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	const factoryOut = <TValue extends Values>(value: TValue) => {
		return new out[
			inverse.get(value) ?? fail(0xb31 /* missing enum value */)
			// "extends unknown" is required here to handle when TValue is an union: each member of the union should be processed independently.
		]() as TValue extends unknown
			? NodeFromSchema<ReturnType<typeof singletonSchema<TScope, TValue>>>
			: never;
	};
	const out = factoryOut as typeof factoryOut & TOut & { readonly schema: SchemaArray };
	for (const [key, value] of enumEntries(members)) {
		const schema = singletonSchema(factory, value);
		schemaArray.push(schema);
		Object.defineProperty(out, key, {
			enumerable: true,
			configurable: false,
			writable: false,
			value: schema,
		});
	}

	Object.defineProperty(out, "schema", {
		enumerable: true,
		configurable: false,
		writable: false,
		value: schemaArray,
	});

	return out;
}

/**
 * Returns en "entries" (like Object.entries) for an enum object, omitting the
 * {@link https://www.typescriptlang.org/docs/handbook/enums.html#reverse-mappings|reverse mappings}
 */
export function enumEntries(
	enumObject: Record<string, string | number>,
): [string, string | number][] {
	// Skip reverse mapping for numeric entries.
	// For numeric entries, TypeScript defines an additional property keyed with the number implicitly converted to a string.
	// Note TypeScript can overwrite its own enum entries in some edge cases (see https://github.com/microsoft/TypeScript/issues/48956), so it's not possible to handle all cases correctly.
	return Object.entries(enumObject).filter(([key, value]) => {
		// All reverse mapping must also have a inverse mapping (the regular forward mapping) to a number:
		const inverse = enumObject[value];
		if (typeof inverse !== "number") {
			// Known not to be a reverse mapping, so keep it.
			return true;
		}
		// At this point, it is expected that all remaining cases are reverse mappings,
		// but do some asserts to ensure that the above logic is sufficient.
		assert(typeof value === "string", "expected reverse mapping and thus a string value");
		assert(
			Number.parseFloat(key).toString() === key,
			"expected reverse mapping and thus a key that is a normalized number",
		);
		// Discard the reverse mapping.
		return false;
	});
}

/**
 * Converts an array of distinct strings into a collection of schema which can be used like an enum style union.
 * @remarks
 * The returned collection is also a function which can be used to convert strings into {@link Unhydrated} nodes in the union.
 * Each node type has a `.value` getter which returns the associated string.
 *
 * The produced nodes use the provided strings as their `name`, and don't store any data beyond that.
 * @example
 * ```typescript
 * const schemaFactory = new SchemaFactory("com.myApp");
 * const Mode = enumFromStrings(schemaFactory, ["Fun", "Cool"]);
 * type Mode = TreeNodeFromImplicitAllowedTypes<typeof Mode.schema>;
 * const nodeFromString: Mode = Mode("Fun");
 * const nodeFromSchema: Mode = new Mode.Fun();
 *
 * // Schema nodes have a strongly typed `.value` property.
 * const nameFromNode: "Fun" | "Cool" = nodeFromSchema.value;
 *
 * class Parent extends schemaFactory.object("Parent", { mode: Mode.schema }) {}
 * ```
 * @see {@link adaptEnum} for a similar function that works on enums instead of arrays of strings.
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function enumFromStrings<
	TScope extends string,
	const Members extends readonly string[],
>(factory: SchemaFactory<TScope>, members: Members) {
	const names = new Set(members);
	if (names.size !== members.length) {
		throw new UsageError("All members of enums must have distinct names");
	}

	type MembersUnion = Members[number];

	// Get all keys of the Members tuple which are numeric strings as union of numbers:
	type Indexes = Extract<keyof Members, `${number}`> extends `${infer N extends number}`
		? N
		: never;

	type TOut = {
		[Index in Indexes as Members[Index]]: ReturnType<
			typeof singletonSchema<TScope, Members[Index] & string>
		>;
	};

	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	const factoryOut = <TValue extends MembersUnion>(value: TValue) => {
		// "extends unknown" is required here to handle when TValue is an union: each member of the union should be processed independently.
		return new recordOut[value]() as TValue extends unknown
			? NodeFromSchema<ReturnType<typeof singletonSchema<TScope, TValue>>>
			: never;
	};

	type SchemaArray = UnionToTuple<MembersUnion extends unknown ? TOut[MembersUnion] : never>;
	const schemaArray: TreeNodeSchema[] = [];

	const out = factoryOut as typeof factoryOut & TOut & { readonly schema: SchemaArray };
	const recordOut = out as Record<MembersUnion, new () => unknown>;
	for (const name of members) {
		const schema = singletonSchema(factory, name);
		schemaArray.push(schema);
		Object.defineProperty(out, name, {
			enumerable: true,
			configurable: false,
			writable: false,
			value: schema,
		});
	}

	Object.defineProperty(out, "schema", {
		enumerable: true,
		configurable: false,
		writable: false,
		value: schemaArray,
	});

	return out;
}

// TODO: This generates an invalid d.ts file if exported due to a bug https://github.com/microsoft/TypeScript/issues/58688.
// TODO: replace enumFromStrings above with this simpler implementation when the TypeScript bug is resolved.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function _enumFromStrings2<TScope extends string, const Members extends readonly string[]>(
	factory: SchemaFactory<TScope>,
	members: Members,
) {
	const enumObject: {
		[key in keyof Members as Members[key] extends string
			? Members[key]
			: string]: Members[key] extends string ? Members[key] : string;
	} = Object.create(null);
	for (const name of members) {
		Object.defineProperty(enumObject, name, {
			enumerable: true,
			configurable: false,
			writable: false,
			value: name,
		});
	}

	return adaptEnum(factory, enumObject);
}
