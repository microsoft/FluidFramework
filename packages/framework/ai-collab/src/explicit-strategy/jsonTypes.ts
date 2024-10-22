/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * TBD
 */
// eslint-disable-next-line @rushstack/no-new-null
export type JsonPrimitive = string | number | boolean | null;

/**
 * TBD
 */
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface JsonObject {
	[key: string]: JsonValue;
}
/**
 * TBD
 */
export type JsonArray = JsonValue[];
/**
 * TBD
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
