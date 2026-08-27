/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RootContent } from "mdast";

import type { Transform, TransformContext } from "../types.js";

export type SchemaDefinition =
	| {
			type: "boolean";
			default?: boolean;
			required?: boolean;
	  }
	| {
			type: "integer";
			default?: number;
			required?: boolean;
			minimum?: number;
			maximum?: number;
	  }
	| {
			type: "string";
			default?: string;
			required?: boolean;
			values?: readonly string[];
	  };

export type OptionsSchema = Record<string, SchemaDefinition>;
type SchemaValue<TDefinition extends SchemaDefinition> = TDefinition["type"] extends "boolean"
	? boolean
	: TDefinition["type"] extends "integer"
		? number
		: string;
type RequiredSchemaKeys<TSchema extends OptionsSchema> = {
	[TKey in keyof TSchema]: TSchema[TKey] extends { default: unknown } | { required: true }
		? TKey
		: never;
}[keyof TSchema];
export type ValidatedOptions<TSchema extends OptionsSchema> = {
	[TKey in RequiredSchemaKeys<TSchema>]: SchemaValue<TSchema[TKey]>;
} & {
	[TKey in Exclude<keyof TSchema, RequiredSchemaKeys<TSchema>>]?: SchemaValue<TSchema[TKey]>;
};

/**
 * Validates transform options against a small JSON-compatible schema.
 *
 * @param value - The options value to validate.
 * @param transformName - The transform name to include in an error.
 * @param schema - The accepted keys, types, defaults, and limits.
 * @returns The validated options with defaults applied.
 */
function validateOptions<TSchema extends OptionsSchema>(
	value: unknown,
	transformName: string,
	schema: TSchema,
): ValidatedOptions<TSchema> {
	if (value === null || Array.isArray(value) || typeof value !== "object") {
		throw new TypeError(`Options for "${transformName}" must be an object.`);
	}
	for (const key of Object.keys(value)) {
		if (!(key in schema)) {
			throw new TypeError(`Unknown option "${key}" for transform "${transformName}".`);
		}
	}

	const options = value as Record<string, unknown>;
	const result: Record<string, unknown> = {};
	for (const [key, definition] of Object.entries(schema)) {
		const option = Object.hasOwn(options, key) ? options[key] : definition.default;
		if (option === undefined) {
			if (definition.required === true) {
				throw new TypeError(`Transform "${transformName}" requires option "${key}".`);
			}
			continue;
		}
		if (definition.type === "integer") {
			if (!Number.isInteger(option)) {
				throw new TypeError(`Option "${key}" for "${transformName}" must be an integer.`);
			}
			const integerOption = option as number;
			if (
				(definition.minimum !== undefined && integerOption < definition.minimum) ||
				(definition.maximum !== undefined && integerOption > definition.maximum)
			) {
				throw new TypeError(
					`Option "${key}" for "${transformName}" must be between ${definition.minimum} and ${definition.maximum}.`,
				);
			}
		} else if (typeof option !== definition.type) {
			throw new TypeError(
				`Option "${key}" for "${transformName}" must be a ${definition.type}.`,
			);
		}
		if (
			definition.type === "string" &&
			definition.values !== undefined &&
			!definition.values.includes(option as string)
		) {
			throw new TypeError(
				`Option "${key}" for "${transformName}" has invalid value "${option}".`,
			);
		}
		result[key] = option;
	}
	return result as ValidatedOptions<TSchema>;
}

/**
 * Creates a transform with schema-based option validation.
 *
 * @param name - The transform name.
 * @param schema - The option schema.
 * @param generate - The node generator.
 * @returns The transform implementation.
 */
export function transform<TSchema extends OptionsSchema>(
	name: string,
	schema: TSchema,
	generate: (
		options: ValidatedOptions<TSchema>,
		context: TransformContext,
	) => RootContent[] | Promise<RootContent[]>,
): Transform {
	return {
		generate: (value, context) => generate(validateOptions(value, name, schema), context),
	};
}
