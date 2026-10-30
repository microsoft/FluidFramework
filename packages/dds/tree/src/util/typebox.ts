/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TObject, TObjectOptions, TProperties, TRecord, TSchema } from "typebox";
import { Memory } from "typebox/system";
import * as Type from "typebox/type";

/**
 * Merges property maps in assignment order, preserving the last schema and its modifiers for each key.
 * Dynamically sized heritage lists cannot provide a precise property map.
 */
type MergedProperties<
	Heritage extends readonly { readonly properties: TProperties }[],
	Properties extends TProperties,
> = Heritage extends readonly [
	...infer Rest extends readonly { readonly properties: TProperties }[],
	{ readonly properties: infer Last extends TProperties },
]
	? MergedProperties<Rest, Omit<Last, keyof Properties> & Properties>
	: number extends Heritage["length"]
		? TProperties
		: Properties;

/**
 * Creates an interface from object schemas without loading TypeBox's general type-instantiation engine.
 * @remarks
 * Only merges property maps: later heritage entries override earlier ones, and `properties` overrides inherited entries.
 * Object-level constraints are supplied through `options`, not inherited.
 * Nested property schemas are shared and must not be mutated.
 *
 * @privateRemarks
 * This and {@link stringKeyRecord} are bundle-size workarounds, not general replacements for TypeBox's builders.
 * With TypeBox 1.4.2, replacing both with the public builders added 9,600 gzip bytes to a production SharedTree export bundle
 * measured with Webpack 5.109.0, Node.js 22.22.3, and gzip level 9.
 * The TypeBox dependency uses a tilde range, enforced by `.syncpackrc.yml`, to allow patches while requiring explicit minor upgrades.
 * Remove that exception when these helpers can be replaced by supported public builders.
 * Re-evaluate on TypeBox upgrades; prefer the public builders once they preserve schema and inferred-type behavior without that bundle overhead.
 * `src/test/util/typebox.spec.ts` covers property composition, static types, and referenced and recursive schemas.
 */
export function typeboxInterface<
	const Heritage extends { readonly properties: TProperties }[],
	const Properties extends TProperties,
>(
	heritage: [...Heritage],
	properties: Properties,
	options: TObjectOptions = {},
): TObject<MergedProperties<Heritage, Properties>> {
	return Type.Object(
		Object.assign(
			{},
			...heritage.map((schema) => schema.properties),
			properties,
		) as MergedProperties<Heritage, Properties>,
		options,
	);
}

/**
 * Creates a schema for an object with arbitrary string keys.
 * @remarks
 * Unlike TypeBox's general-purpose `Record` builder, this does not load its template-literal parser.
 * Preserves the value schema so references resolve in the enclosing schema's context.
 * The value schema is shared and must not be mutated.
 * This helper only supports unconstrained string keys, not finite sets of keys or template-literal key schemas.
 *
 * @privateRemarks
 * Depends on TypeBox's `~kind` metadata and the schema representation accepted by `Memory.Create`; verify both when upgrading TypeBox.
 * See {@link typeboxInterface} for the measured bundle-size rationale and the criteria for replacing these helpers.
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
