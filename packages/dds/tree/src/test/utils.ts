/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { InvalidationToken, SimpleObservingDependent } from "../dependency-tracking";

// Testing utilities

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

export class MockDependent extends SimpleObservingDependent {
	public readonly tokens: (InvalidationToken | undefined)[] = [];
	public constructor(name: string = "MockDependent") {
		super((token) => this.tokens.push(token), name);
	}
}
