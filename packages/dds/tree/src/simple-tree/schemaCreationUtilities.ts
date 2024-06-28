/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { EmptyObject } from "../feature-libraries/index.js";
import { fail } from "../util/index.js";

import type { SchemaFactory, ScopedSchemaName } from "./schemaFactory.js";
import type { NodeFromSchema, NodeKind, TreeNodeSchemaClass } from "./schemaTypes.js";
import type { TreeNode } from "./types.js";
import type {
	InsertableObjectFromSchemaRecord,
	ObjectFromSchemaRecord,
} from "./objectNode.js";

/**
 * Create a schema for a node with no state.
 * @remarks
 * This is commonly used in unions when the only information needed is which kind of node the value is.
 * Enums are a common example of this pattern.
 * @internal
 */
// Return type is intentionally derived.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function singletonSchema<TScope extends string, TName extends string | number>(
	factory: SchemaFactory<TScope, TName>,
	name: TName,
) {
	class SingletonSchema extends factory.object(name, {}) {
		public constructor(data?: EmptyObject) {
			super(data ?? {});
		}
		public get value(): TName {
			return name;
		}
	}

	type NodeType = object &
		TreeNode &
		ObjectFromSchemaRecord<EmptyObject> & { readonly value: TName };

	// Returning SingletonSchema without a type conversion results in TypeScript generating something like `readonly "__#124291@#brand": unknown;`
	// for the private brand field of TreeNode.
	// This numeric id doesn't seem to be stable over incremental builds, and thus causes diffs in the API extractor reports.
	// This is avoided by doing this type conversion.
	// The conversion is done via assignment instead of `as` to get stronger type safety.
	const toReturn: TreeNodeSchemaClass<
		ScopedSchemaName<TScope, TName>,
		NodeKind.Object,
		NodeType,
		object & InsertableObjectFromSchemaRecord<EmptyObject>,
		true
	> &
		(new () => NodeType) = SingletonSchema;

	return toReturn;
}

/**
 * Converts an enum into a collection of schema which can be used in a union.
 * @remarks
 * Currently only supports `string` enums.
 * @example
 * ```typescript
 * enum Mode {
 * 	a = "A",
 * 	b = "B",
 * }
 * const ModeNodes = adaptEnum(schema, Mode);
 * type ModeNodes = NodeFromSchema<(typeof ModeNodes)[keyof typeof ModeNodes]>;
 * const nodeFromString: ModeNodes = ModeNodes(Mode.a);
 * const nodeFromSchema: ModeNodes = new ModeNodes.a();
 * const nameFromNode: Mode = nodeFromSchema.value;
 * class Parent extends schemaFactory.object("Parent", {
 * 	mode: typedObjectValues(ModeNodes),
 * }) {}
 * ```
 * @privateRemarks
 * TODO:
 * Extends this to support numeric enums.
 * Maybe require an explicit nested scope to group them under, or at least a warning about collisions.
 * Maybe just provide `SchemaFactory.nested` to east creating nested scopes?
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function adaptEnum<TScope extends string, const TEnum extends Record<string, string>>(
	factory: SchemaFactory<TScope>,
	members: TEnum,
) {
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
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	const factoryOut = <TValue extends Values>(value: TValue) => {
		return new out[inverse.get(value) ?? fail("missing enum value")]({}) as NodeFromSchema<
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
 * @internal
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
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function enumFromStrings<TScope extends string, const Members extends string>(
	factory: SchemaFactory<TScope>,
	members: readonly Members[],
) {
	const names = new Set(members);
	if (names.size !== members.length) {
		throw new UsageError("All members of enums must have distinct names");
	}

	type TOut = Record<Members, ReturnType<typeof singletonSchema<TScope, Members>>>;
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	const factoryOut = <TValue extends Members>(value: TValue) => {
		return new out[value]({}) as NodeFromSchema<
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

// TODO: Why does this one generate an invalid d.ts file if exported?
// Tracked by https://github.com/microsoft/TypeScript/issues/58688
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
