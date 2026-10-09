/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	TInterface,
	TObjectOptions,
	TOptional,
	TProperties,
	TReadonly,
	TRecord,
	TSchema,
} from "typebox";
import { Memory, Settings } from "typebox/system";
import * as Type from "typebox/type";

/**
 * Applies an optional or readonly modifier without deep-copying the schema.
 * @remarks
 * TypeBox 1.3.34's public modifiers deep-copy nested schemas twice, which makes SharedTree schema construction expensive.
 * This workaround copies only the outer property descriptors, preserving hidden metadata without copying nested schemas.
 * It also bypasses the general type-instantiation engine, though the bundle-size benefit depends on tree shaking.
 *
 * This approach depends on TypeBox's modifier keys and metadata representation rather than its public modifier APIs.
 * It manually reproduces the relevant settings behavior and must be checked when TypeBox changes.
 * Unlike a deep copy, it shares nested objects: mutations through either schema can affect the other.
 * The `immutableTypes` setting only freezes the outer result; it does not make the shared schema graph immutable.
 * Callers must therefore treat shared nested objects as immutable.
 *
 * Prefer the public modifiers once upstream provides an efficient implementation with suitable sharing semantics.
 * See `packages/dds/tree/docs/wip/typebox-1-upgrade-blockers.md`
 * for measurements, customer bundle-size limitations, and proposed upstream fixes.
 */
function withTypeModifier<Type extends TSchema, Key extends "~optional" | "~readonly">(
	type: Type,
	key: Key,
): Type & { [P in Key]: true } {
	const settings = Settings.Get();
	// Preserve hidden TypeBox metadata without copying nested schemas.
	const result = Object.defineProperties(
		{},
		{
			...Object.getOwnPropertyDescriptors(type),
			[key]: {
				value: true,
				writable: true,
				configurable: true,
				enumerable: settings.enumerableKind,
			},
		},
	);
	if (settings.immutableTypes) {
		Object.freeze(result);
	}
	return result as Type & { [P in Key]: true };
}

/**
 * Applies TypeBox's optional property modifier without loading its general type-instantiation engine.
 * Nested schemas are shared with the input.
 */
export function typeboxOptional<Type extends TSchema>(type: Type): TOptional<Type> {
	return withTypeModifier(type, "~optional");
}

/**
 * Applies TypeBox's readonly property modifier without loading its general type-instantiation engine.
 * Nested schemas are shared with the input.
 */
export function typeboxReadonly<Type extends TSchema>(type: Type): TReadonly<Type> {
	return withTypeModifier(type, "~readonly");
}

/**
 * Creates an interface from object schemas without loading TypeBox's general type-instantiation engine.
 */
export function typeboxInterface<
	const Heritage extends { readonly properties: TProperties }[],
	const Properties extends TProperties,
>(
	heritage: [...Heritage],
	properties: Properties,
	options: TObjectOptions = {},
): TInterface<Heritage, Properties> {
	return Type.Object(
		Object.assign({}, ...heritage.map((schema) => schema.properties), properties),
		options,
	) as unknown as TInterface<Heritage, Properties>;
}

/**
 * Creates a schema for an object with arbitrary string keys.
 * @remarks
 * Unlike TypeBox's general-purpose `Record` builder, this does not load its template-literal parser.
 * Preserves the value schema so references resolve in the enclosing schema's context.
 */
export function stringKeyRecord<Value extends TSchema>(
	value: Value,
	options: TObjectOptions = {},
): TRecord<"^.*$", Value> {
	return Memory.Create(
		{ "~kind": "Record" },
		{
			type: "object",
			patternProperties: { "^.*$": value },
		},
		options,
	) as TRecord<"^.*$", Value>;
}
