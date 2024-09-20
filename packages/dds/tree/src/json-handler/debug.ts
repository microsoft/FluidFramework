/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export function assert(condition: boolean): void {
	if (!condition) {
		throw new Error("Assert failed");
	}
}
