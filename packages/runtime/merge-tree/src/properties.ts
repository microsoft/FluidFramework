/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-param-reassign */

import ops from "./ops";

// tslint:disable:interface-name

export interface MapLike<T> {
    [index: string]: T;
}

// We use any because when you include custom methods
// such as toJSON(), JSON.stringify accepts most types other
// than functions
export type PropertySet = MapLike<any>;

// Assume these are created with Object.create(null)

export interface IConsensusValue {
    seq: number;
    value: any;
}

export function combine(combiningInfo: ops.ICombiningOp, currentValue: any, newValue: any, seq?: number) {
    if (currentValue === undefined) {
        currentValue = combiningInfo.defaultValue;
    }
    // Fixed set of operations for now
    /* eslint-disable default-case */
    switch (combiningInfo.name) {
        case "incr":
            currentValue += newValue as number;
            if (combiningInfo.minValue) {
                if (currentValue < combiningInfo.minValue) {
                    currentValue = combiningInfo.minValue;
                }
            }
            break;
        case "consensus":
            if (currentValue === undefined) {
                const cv: IConsensusValue = {
                    value: newValue,
                    seq,
                };

                currentValue = cv;
            } else {
                const cv = currentValue as IConsensusValue;
                if (cv.seq === -1) {
                    cv.seq = seq;
                }
            }
            break;
    }
    /* eslint-enable default-case */
    return currentValue;
}

export function matchProperties(a: PropertySet, b: PropertySet) {
    if (a) {
        if (!b) {
            return false;
        } else {
            // For now, straightforward; later use hashing
            // eslint-disable-next-line no-restricted-syntax
            for (const key in a) {
                if (b[key] === undefined) {
                    return false;
                } else if (b[key] !== a[key]) {
                    return false;
                }
            }
            // eslint-disable-next-line no-restricted-syntax
            for (const key in b) {
                if (a[key] === undefined) {
                    return false;
                }
            }
        }
    } else {
        if (b) {
            return false;
        }
    }
    return true;
}

export function extend<T>(base: MapLike<T>, extension: MapLike<T>, combiningOp?: ops.ICombiningOp, seq?: number) {
    if (extension !== undefined) {
        if ((typeof extension !== "object")) {
            console.log(`oh my ${extension}`);
        }
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const key in extension) {
            const v = extension[key];
            if (v === null) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete base[key];
            } else {
                if (combiningOp && (combiningOp.name !== "rewrite")) {
                    base[key] = combine(combiningOp, base[key], v, seq);
                } else {
                    base[key] = v;
                }
            }
        }
    }
    return base;
}

export function clone<T>(extension: MapLike<T>) {
    if (extension === undefined) {
        return undefined;
    }
    const cloneMap = createMap<T>();
    // eslint-disable-next-line guard-for-in, no-restricted-syntax
    for (const key in extension) {
        const v = extension[key];
        if (v !== null) {
            cloneMap[key] = v;
        }
    }
    return cloneMap;
}

export function addProperties(oldProps: PropertySet, newProps: PropertySet, op?: ops.ICombiningOp, seq?: number) {
    if ((!oldProps) || (op && (op.name === "rewrite"))) {
        oldProps = createMap<any>();
    }
    extend(oldProps, newProps, op, seq);
    return oldProps;
}

export function extendIfUndefined<T>(base: MapLike<T>, extension: MapLike<T>) {
    if (extension !== undefined) {
        if ((typeof extension !== "object")) {
            console.log(`oh my ${extension}`);
        }
        // eslint-disable-next-line no-restricted-syntax
        for (const key in extension) {
            if (base[key] === undefined) {
                base[key] = extension[key];
            }
        }
    }
    return base;
}

// Create a MapLike with good performance.
export function createMap<T>(): MapLike<T> {
    const map = Object.create(null); // tslint:disable-line:no-null-keyword

    // Using 'delete' on an object causes V8 to put the object in dictionary mode.
    // This disables creation of hidden classes, which are expensive when an object is
    // constantly changing shape.
    // eslint-disable-next-line dot-notation
    map["__"] = undefined;
    // eslint-disable-next-line dot-notation, @typescript-eslint/no-dynamic-delete
    delete map["__"];

    return map;
}
