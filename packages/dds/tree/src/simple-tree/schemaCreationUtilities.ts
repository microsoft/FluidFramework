/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils";
import { fail } from "../util/index.js";
import { SchemaFactory, type ScopedSchemaName } from "./schemaFactory.js";
import { NodeFromSchema, NodeKind, TreeNodeSchemaClass } from "./schemaTypes.js";
import { TreeNode } from "./types.js";

/*
 * This file does two things:
 *
 * 1. Provides tools for making schema for cases like enums.
 *
 * 2. Demonstrates the kinds of schema utilities apps can write.
 * Nothing in here needs access to package internal APIs.
 * TODO:
 * Typing around overloaded constructors (hiding that flex nodes can be passed in)
 * for schema currently leads to needing inside knowledge to implement the correctly.
 * That should be fixed.
 */

/**
 * Create a schema for a node with no state.
 * @remarks
 * This is commonly used in unions when the only information needed is which kind of node the value is.
 * Enums are a common example of this pattern.
 * @see {@link adaptEnum}
 * @beta
 */
export function singletonSchema<TScope extends string, TName extends string | number>(
	factory: SchemaFactory<TScope, TName>,
	name: TName,
) {
	class SingletonSchema extends factory.object(name, {}) {
		public constructor(data?: unknown) {
			super(data ?? {});
		}
		public get value(): TName {
			return name;
		}
	}

	type NodeType = TreeNode & { readonly value: TName };

	// Returning SingletonSchema without a type conversion results in TypeScript generating something like `readonly "__#124291@#brand": unknown;`
	// for the private brand field of TreeNode.
	// This numeric id doesn't seem to be stable over incremental builds, and thus causes diffs in the API extractor reports.
	// This is avoided by doing this type conversion.
	// The conversion is done via assignment instead of `as` to get stronger type safety.
	const toReturn: TreeNodeSchemaClass<
		ScopedSchemaName<TScope, TName>,
		NodeKind.Object,
		NodeType,
		never,
		true
	> &
		(new () => NodeType) = SingletonSchema;

	return toReturn;
}

/**
 * Converts an enum into a collection of schema which can be used in a union.
 * @remarks
 * Currently only supports `string` enums.
 * The string value of the enum is used as the name of the schema: ensure that its stable and unique.
 * Consider making a dedicated schema factory with a nested scope to avoid the enum members colliding with other schema.
 * @example
 * ```typescript
 * const schemaFactory = new SchemaFactory("com.myApp");
 * // An enum for use in the tree. Must have string keys.
 * export enum Mode {
 * 	a = "A",
 * 	b = "B",
 * }
 * // Define the schema for each member of the enum using a nested scope to group them together.
 * export const ModeNodes = adaptEnum(new SchemaFactory(`${schemaFactory.scope}.Mode`), Mode);
 * // Defined the types of the nodes which correspond to this the schema.
 * export type ModeNodes = NodeFromSchema<(typeof ModeNodes)[keyof typeof ModeNodes]>;
 * // An example schema which has an enum as a child.
 * export class Parent extends schemaFactory.object("Parent", {
 * 	// typedObjectValues extracts a list of all the fields of ModeNodes, which are the schema for each enum member.
 * 	// This means any member of the enum is allowed in this field.
 * 	mode: typedObjectValues(ModeNodes),
 * }) {}
 *
 * // Example constructing a tree containing an enum node from an enum value.
 * // The syntax `new ModeNodes.a()` is also supported.
 * export const config = new TreeConfiguration(Parent, () => ({
 * 	mode: ModeNodes(Mode.a),
 * }));
 *
 * // Example usage of enum based nodes, showing what type to use and that `.value` can be used to read out the enum value.
 * export function getValue(node: ModeNodes): Mode {
 * 	return node.value;
 * }
 * ```
 * @privateRemarks
 * TODO:
 * Extend this to support numeric enums.
 * Maybe provide `SchemaFactory.nested` to ease creating nested scopes?
 * @see {@link enumFromStrings} for a similar function that works on arrays of strings instead of an enum.
 * @beta
 */
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
	const factoryOut = <TValue extends Values>(value: TValue) => {
		return new out[inverse.get(value) ?? fail("missing enum value")]() as NodeFromSchema<
			ReturnType<typeof singletonSchema<TScope, TValue>>
		>;
	};
	const out = factoryOut as typeof factoryOut & TOut;
	for (const [key, value] of Object.entries(members)) {
		Object.defineProperty(out, key, {
			enumerable: true,
			configurable: false,
			writable: false,
			value: singletonSchema(factory, value),
		});
	}

	return out;
}

/**
 * `Object.values`, but with more specific types.
 * @remarks
 * Useful with collections of schema, like those returned by {@link adaptEnum} or {@link enumFromStrings}.
 * @beta
 */
export function typedObjectValues<TKey extends string, TValues>(
	object: Record<TKey, TValues>,
): TValues[] {
	return Object.values(object);
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
 * const Mode = enumFromStrings(schemaFactory, ["Fun", "Cool"]);
 * type Mode = NodeFromSchema<(typeof Mode)[keyof typeof Mode]>;
 * const nodeFromString: Mode = Mode("Fun");
 * const nodeFromSchema: Mode = new Mode.Fun();
 * const nameFromNode = nodeFromSchema.value;
 *
 * class Parent extends schemaFactory.object("Parent", { mode: typedObjectValues(Mode) }) {}
 * ```
 * @see {@link adaptEnum} for a similar function that works on enums instead of arrays of strings.
 * @beta
 */
export function enumFromStrings<TScope extends string, const Members extends string>(
	factory: SchemaFactory<TScope>,
	members: Members[],
) {
	const names = new Set(members);
	if (names.size !== members.length) {
		throw new UsageError("All members of enums must have distinct names");
	}

	type TOut = Record<Members, ReturnType<typeof singletonSchema<TScope, Members>>>;
	const factoryOut = <TValue extends Members>(value: TValue) => {
		return new out[value]() as NodeFromSchema<
			ReturnType<typeof singletonSchema<TScope, TValue>>
		>;
	};
	const out = factoryOut as typeof factoryOut & TOut;
	for (const name of members) {
		Object.defineProperty(out, name, {
			enumerable: true,
			configurable: false,
			writable: false,
			value: singletonSchema(factory, name),
		});
	}

	return out;
}

// TODO: This generates an invalid d.ts file if due to a bug https://github.com/microsoft/TypeScript/issues/56718 which is fixed in TypeScript 5.4.
// TODO: replace enumFromStrings above with this simpler implementation when we require at least TypeScript 5.4 to use this package.
function _enumFromStrings2<TScope extends string, const Members extends readonly string[]>(
	factory: SchemaFactory<TScope>,
	members: Members,
) {
	const enumObject: {
		[key in keyof Members as Members[key] extends string ? Members[key] : string]: Members[key];
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
