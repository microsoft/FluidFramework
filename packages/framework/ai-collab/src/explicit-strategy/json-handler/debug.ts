/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * TBD
 */
export function assert(condition: boolean): void {
	if (!condition) {
		throw new Error("Assert failed");
	}
}
