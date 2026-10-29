/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TInterface, TObjectOptions, TProperties, TRecord, TSchema } from "typebox";
import { Memory } from "typebox/system";
import * as Type from "typebox/type";

/**
 * Creates an interface from object schemas without loading TypeBox's general type-instantiation engine.
 * See `packages/dds/tree/docs/wip/typebox-1-upgrade-blockers.md` for the TypeBox 1.4.2 bundle comparison.
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
 * See `packages/dds/tree/docs/wip/typebox-1-upgrade-blockers.md` for the TypeBox 1.4.2 bundle comparison.
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
