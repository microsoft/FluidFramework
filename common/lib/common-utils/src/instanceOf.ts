/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const toString: (value: any) => string = (value) => Object.prototype.toString.call(value);
const objectString = toString(Object.prototype);

/**
 * Plain-Old-JavaScript-Object -- as recommended by TypeScript
 */
export type POJO = Record<string, unknown>;

/**
 * Tests if the passed value is a plain-old-javascript-object
 * @param value - the value to check
 * @returns true if the value is an object, otherwise false
 */
export function instanceOfObject(value: any): value is POJO {
    return value !== null && typeof value === "object";
}

/**
 * Produces partially applied functions that test if passed values match the provided builtin instance type
 * @param match - an instance of the builtin to match subsequent values with
 * @returns the partially applied test function -- (value: any): value is typeof match
 */
export function bindInstanceOfBuiltin<T>(match: T) {
    const compareString = toString(match);

    if (compareString === objectString) {
        throw new Error("bindInstanceOfBuiltin cannot classify '[object Object]' instances");
    }

    return (value: any): value is T => compareString === toString(value);
}

// RFC:
// Object.freeze?  Non-configurable getters?  Individual exports?
// How "hostile" should the environment be treated?
export const instanceOf = {
    Object: instanceOfObject,

    ArrayBuffer: bindInstanceOfBuiltin(ArrayBuffer.prototype),
    Error: bindInstanceOfBuiltin(new Error("N/A")),
    Map: bindInstanceOfBuiltin(Map.prototype),
    Set: bindInstanceOfBuiltin(Set.prototype),
    Uint8Array: bindInstanceOfBuiltin(new Uint8Array()),
};
