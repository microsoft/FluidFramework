/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

let counter = 0;

const idMap = new WeakMap<object, number>();

/**
 * Associates a unique number with an object.
 * @remarks
 * The ID number is tied to the object identity, not the object's contents; modifying the object will not cause it to get a different ID.
 *
 * This can be handy for generating {@link https://react.dev/learn/rendering-lists#where-to-get-your-key | keys for React lists} from TreeNodes.
 *
 * Most cases which could use this function should just use the objects themselves instead of getting IDs from them, since the objects will have the same equality as the IDs.
 * For example, if storing data associated with the objects in a map, using the object as the key is more efficient than getting an ID from it and using that.
 * This functions exists to deal with the edge case where you would like to use object identity, but you can't.
 * React keys are an examples of such a case, since React does not allow objects as keys.
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
