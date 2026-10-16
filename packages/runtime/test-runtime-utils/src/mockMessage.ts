/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	encodeHandleForSerialization,
	isFluidHandle,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";

/**
 * Serializes mock messages using the same handle encoding as the container runtime.
 */
export function serializeMockMessage(message: unknown): string {
	return JSON.stringify(message, (_key, value: unknown) =>
		isFluidHandle(value) ? encodeHandleForSerialization(toFluidHandleInternal(value)) : value,
	);
}
