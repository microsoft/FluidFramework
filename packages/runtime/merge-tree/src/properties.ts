/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ops from "./ops";

// tslint:disable:interface-name
// tslint:disable:no-for-in
// tslint:disable:forin
// tslint:disable:switch-default
// tslint:disable:no-parameter-reassignment
// tslint:disable:switch-final-break
// tslint:disable:object-literal-sort-keys
// tslint:disable:no-unsafe-any

export interface MapLike<T> {
    [index: string]: T;
}

// we use any because when you include custom methods
// such as toJSON(), JSON.stringify accepts most types other
// than functions
export type PropertySet = MapLike<any>;

// assume these are created with Object.create(null)

export interface IConsensusValue {
    seq: number;
    value: any;
}

export function combine(combiningInfo: ops.ICombiningOp, currentValue: any, newValue: any, seq?: number) {
    if (currentValue === undefined) {
        currentValue = combiningInfo.defaultValue;
    }
    // fixed set of operations for now
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
    return currentValue;
}

export function matchProperties(a: PropertySet, b: PropertySet) {
    if (a) {
        if (!b) {
            return false;
        } else {
            // for now, straightforward; later use hashing
            for (const key in a) {
                if (b[key] === undefined) {
                    return false;
                } else if (b[key] !== a[key]) {
                    return false;
                }
            }
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
        for (const key in extension) {
            const v = extension[key];
            if (v === null) {
                // tslint:disable-next-line: no-dynamic-delete
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
    // tslint:disable-next-line: no-string-literal
    map["__"] = undefined;
    // tslint:disable-next-line: no-dynamic-delete no-string-literal
    delete map["__"];

    // tslint:disable-next-line: no-unsafe-any
    return map;
}
