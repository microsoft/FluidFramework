/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Attempt to pin "load-time" implementations of call and toString to avoid
 * behavior changes at "run-time" caused by unexpected prototype manipulation
 */
const pinnedObjectToString: (value: any) => string = Function.prototype.call.bind(
    Object.prototype.toString, // eslint-disable-line @typescript-eslint/unbound-method
);

const prototypeToString: (value: any) => string = (value) => pinnedObjectToString(value);

const objectString = prototypeToString(Object.prototype);

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
    const compareString = prototypeToString(match);

    if (compareString === objectString) {
        throw new Error(`bindInstanceOfBuiltin cannot classify '${objectString}' instances`);
    }

    return (value: any): value is T => compareString === prototypeToString(value);
}
