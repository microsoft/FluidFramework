/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const frozenMethod = () => {
	throw new Error("Object is frozen");
};

function freezeObjectMethods<T>(object: T, methods: (keyof T)[]): void {
	if (Object.isFrozen(object)) {
		for (const method of methods) {
			if (object[method] !== frozenMethod) {
				throw new Error(`Method ${method.toString()} should be frozen`);
			}
		}
	} else {
		for (const method of methods) {
			Object.defineProperty(object, method, {
				enumerable: false,
				configurable: false,
				writable: false,
				value: frozenMethod,
			});
		}
	}
}

/**
 * Recursively freezes the given object.
 *
 * WARNING: this function mutates Map and Set instances to override their mutating methods in order to ensure that the
 * state of those instances cannot be changed. This is necessary because calling `Object.freeze` on a Set or Map does
 * not prevent it from being mutated.
 *
 * @param object - The object to freeze.
 * @param filter - A function which returns true for objects which should be frozen and false for objects which should be ignored.
 * deepFreeze will not recurse into ignored objects.
 * If undefined, all reachable objects will be frozen.
 *
 * @internal
 */
export function deepFreeze<T>(object: T, filter?: (object: object) => boolean): void {
	if (object === undefined || object === null) {
		return;
	}

	if (filter !== undefined && !filter(object)) {
		return;
	}

	if (object instanceof Map) {
		for (const [key, value] of object.entries()) {
			deepFreeze(key, filter);
			deepFreeze(value, filter);
		}
		freezeObjectMethods(object, ["set", "delete", "clear"]);
	} else if (object instanceof Set) {
		for (const key of object.keys()) {
			deepFreeze(key, filter);
		}
		freezeObjectMethods(object, ["add", "delete", "clear"]);
	} else {
		// Retrieve the property names defined on object
		const propNames: (keyof T)[] = Object.getOwnPropertyNames(object) as (keyof T)[];
		// Freeze properties before freezing self
		for (const name of propNames) {
			const value = object[name];
			if (typeof value === "object") {
				deepFreeze(value, filter);
			}
		}
	}
	Object.freeze(object);
}
