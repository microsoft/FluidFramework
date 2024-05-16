/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

let counter = 0;

const idMap = new WeakMap<object, number>();

/**
 * Associates a unique number with an object.
 * @remarks
 * This can be handy for generating ids for React from TreeNodes.
 * @public
 */
export function objectIdNumber(object: object): number {
	const id = idMap.get(object);
	if (id !== undefined) {
		return id;
	}
	counter++;
	idMap.set(object, counter);
	return counter;
}
