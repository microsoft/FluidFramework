/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Primitive JSON Types
 */
// eslint-disable-next-line @rushstack/no-new-null
export type JsonPrimitive = string | number | boolean | null;

/**
 * A JSON Object, a collection of key to {@link JsonValue} pairs
 */
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface JsonObject {
	[key: string]: JsonValue;
}
/**
 * An Array of {@link JsonValue}
 */
export type JsonArray = JsonValue[];

/**
 * A union type of all possible JSON values, including primitives, objects, and arrays
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
