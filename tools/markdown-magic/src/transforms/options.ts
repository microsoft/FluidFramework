/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RootContent } from "mdast";

import type { Transform, TransformContext } from "../types.js";

/**
 * Defines a Boolean transform option.
 */
interface BooleanSchemaDefinition {
	/**
	 * The required runtime type of the option.
	 */
	type: "boolean";

	/**
	 * The value to use when the marker omits the option.
	 *
	 * @defaultValue `undefined`
	 */
	default?: boolean;

	/**
	 * Whether the marker must provide the option when no default exists.
	 *
	 * @defaultValue `false`
	 */
	required?: boolean;
}

/**
 * Defines an integer transform option and its accepted range.
 */
interface IntegerSchemaDefinition {
	/**
	 * The required runtime type of the option.
	 */
	type: "integer";

	/**
	 * The value to use when the marker omits the option.
	 *
	 * @defaultValue `undefined`
	 */
	default?: number;

	/**
	 * Whether the marker must provide the option when no default exists.
	 *
	 * @defaultValue `false`
	 */
	required?: boolean;

	/**
	 * The inclusive lower bound for the option.
	 *
	 * @defaultValue `undefined` (no lower bound)
	 */
	minimum?: number;

	/**
	 * The inclusive upper bound for the option.
	 *
	 * @defaultValue `undefined` (no upper bound)
	 */
	maximum?: number;
}

/**
 * Defines a string transform option and its accepted values.
 */
interface StringSchemaDefinition {
	/**
	 * The required runtime type of the option.
	 */
	type: "string";

	/**
	 * The value to use when the marker omits the option.
	 *
	 * @defaultValue `undefined`
	 */
	default?: string;

	/**
	 * Whether the marker must provide the option when no default exists.
	 *
	 * @defaultValue `false`
	 */
	required?: boolean;

	/**
	 * The complete set of accepted values, when the option is restricted.
	 *
	 * @defaultValue `undefined` (accept any string value)
	 */
	values?: readonly string[];
}

/**
 * A schema definition for one JSON-compatible transform option.
 */
export type SchemaDefinition =
	| BooleanSchemaDefinition
	| IntegerSchemaDefinition
	| StringSchemaDefinition;

/**
 * A transform's option definitions indexed by marker option name.
 */
export type OptionsSchema = Record<string, SchemaDefinition>;

/**
 * Resolves a schema definition to the value type accepted at runtime.
 */
type SchemaValue<TDefinition extends SchemaDefinition> = TDefinition["type"] extends "boolean"
	? boolean
	: TDefinition["type"] extends "integer"
		? number
		: string;

/**
 * Selects schema keys that validation always supplies because they are required or have defaults.
 */
type RequiredSchemaKeys<TSchema extends OptionsSchema> = {
	[TKey in keyof TSchema]: TSchema[TKey] extends { default: unknown } | { required: true }
		? TKey
		: never;
}[keyof TSchema];

/**
 * Maps an option schema to its validated value shape.
 *
 * Keys with defaults or required definitions are present. Other keys remain optional.
 */
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
