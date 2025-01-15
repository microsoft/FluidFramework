/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Potential reasons for disconnect events emitted by {@link @fluidframework/container-definitions#IContainer}.
 * @legacy
 * @alpha
 */
export const DisconnectReason = {
	Expected: "Expected",
	Corruption: "Corruption",
	Unknown: "Unknown",
} as const;

/**
 * {@inheritDoc (DisconnectReason:variable)}
 * @legacy
 * @alpha
 */
export type DisconnectReason = (typeof DisconnectReason)[keyof typeof DisconnectReason];
