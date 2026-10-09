/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	Static,
	TInterface,
	TObjectOptions,
	TOptional,
	TProperties,
	TReadonly,
	TSchema,
	TUnsafe,
} from "typebox";
import { Memory } from "typebox/system";
import * as Type from "typebox/type";

function withTypeModifier<Type extends TSchema, Key extends "~optional" | "~readonly">(
	type: Type,
	key: Key,
): Type & { [P in Key]: true } {
	return Memory.Update(type, { [key]: true }, {}) as Type & { [P in Key]: true };
}

/**
 * Applies TypeBox's optional property modifier without loading its general type-instantiation engine.
 */
export function typeboxOptional<Type extends TSchema>(type: Type): TOptional<Type> {
	return withTypeModifier(type, "~optional");
}

/**
 * Applies TypeBox's readonly property modifier without loading its general type-instantiation engine.
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
 *
 * Unlike TypeBox's general-purpose `Record` builder, this does not load its template-literal parser.
 */
export function stringKeyRecord<Value extends TSchema>(
	value: Value,
	options: TObjectOptions = {},
): TUnsafe<Record<string, Static<Value>>> {
	return Type.Unsafe<Record<string, Static<Value>>>({
		type: "object",
		patternProperties: { "^.*$": value },
		...options,
	});
}
