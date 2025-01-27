/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Potential reasons for disconnect events emitted by {@link @fluidframework/container-definitions#IContainer}.
 *
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

/**
 * Type guard that checks if a value is a valid DisconnectReason.
 *
 * @param value - The value to check
 * @returns True if the value is a valid DisconnectReason, false otherwise
 * @legacy
 * @alpha
 */
export const isDisconnectReason = (value: unknown): value is DisconnectReason =>
	value !== undefined &&
	typeof value === "string" &&
	Object.values(DisconnectReason).includes(value as DisconnectReason);
