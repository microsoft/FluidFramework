/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export function deepFreeze<T>(object: T): void {
	// Retrieve the property names defined on object
	const propNames = Object.getOwnPropertyNames(object);
	// Freeze properties before freezing self
	for (const name of propNames) {
		const value = object[name];
		if (value && typeof value === "object") {
			deepFreeze(value);
		}
	}
	Object.freeze(object);
}
