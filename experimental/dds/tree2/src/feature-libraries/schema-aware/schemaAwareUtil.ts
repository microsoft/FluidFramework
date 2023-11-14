/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ValueSchema, TreeValue } from "../../core";

/**
 * {@link ValueSchema} | undefined to allowed types for that schema.
 * @alpha
 */
export type TypedValueOrUndefined<TValue extends ValueSchema | undefined> =
	TValue extends ValueSchema ? TreeValue<TValue> : undefined;

/**
 * @alpha
 */
export type ValuesOf<T> = T[keyof T];
