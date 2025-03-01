/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SharedObjectKind } from "@fluidframework/shared-object-base";

import type { DataObjectKind } from "./types.js";

/**
 * Utility for creating SharedObjectKind instances for data objects.
 * @typeParam T - The kind of data object.
 * @internal
 */
export function createDataObjectKind<T extends DataObjectKind>(
	factory: T,
): T & SharedObjectKind<T extends DataObjectKind<infer I> ? I : unknown> {
	return factory as T & SharedObjectKind<T extends DataObjectKind<infer I> ? I : unknown>;
}
