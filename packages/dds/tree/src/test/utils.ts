/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export function deepFreeze<T>(object: T): void {
	// Retrieve the property names defined on object
	const propNames: (keyof T)[] = Object.getOwnPropertyNames(object) as (keyof T)[];
	// Freeze properties before freezing self
	for (const name of propNames) {
		const value = object[name];
		if (typeof value === "object") {
			deepFreeze(value);
		}
	}
	Object.freeze(object);
}
