/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

export function example(): void {
	assert(true, "This is an untagged assert message");
}
