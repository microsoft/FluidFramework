/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Object.entries retyped to support branded string-based keys.
 *
 * @internal
 */
export const brandedObjectEntries = Object.entries as <K extends string, T>(
	o: Record<K, T>,
) => [K, T][];
