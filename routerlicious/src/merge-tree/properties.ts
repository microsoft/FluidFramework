// tslint:disable
import * as ops from "./ops";
import * as Collections from "./collections";
/**
 * For each contingent property, a list of contingent local changes,
 * in change order.  
 */
export type ContingentPropertySet = MapLike<Collections.List<any>>;

export interface MapLike<T> {
    [index: string]: T;
}

// we use any because when you include custom methods 
// such as toJSON(), JSON.stringify accepts most types other
// than functions 
export type PropertySet = MapLike<any>;

// assume these are created with Object.create(null)

export function combine(combiningInfo: ops.ICombiningOp, currentValue: any, newValue: any) {
    if (currentValue === undefined) {
        currentValue = combiningInfo.defaultValue;
    }
    // fixed set of operations for now 
    switch (combiningInfo.name) {
        case "incr":
            currentValue += <number>newValue;
            if (combiningInfo.minValue) {
                if (currentValue < combiningInfo.minValue) {
                    currentValue = combiningInfo.minValue;
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
            for (let key in a) {
                if (b[key] === undefined) {
                    return false;
                } else if (b[key] !== a[key]) {
                    return false;
                }
            }
            for (let key in b) {
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

export function readContingentProperty(name: string, props: PropertySet,
    contingentProps: ContingentPropertySet) {
    let contingentPropList = contingentProps[name];
    if ((contingentPropList !== undefined) && (!contingentPropList.empty())) {
        return contingentPropList.last();
    } else {
        return props[name];
    }
}

export function contingentExtend<T>(contingentBase: ContingentPropertySet,
    base: MapLike<T>, extension: MapLike<T>, combiningOp?: ops.ICombiningOp) {
    if (extension !== undefined) {
        if ((typeof extension !== "object")) {
            console.log(`oh my ${extension}`);
        }
        for (let key in extension) {
            let v = extension[key];
            // TODO: consider some type constraints on ops
            let oldProp = readContingentProperty(key, base, contingentBase);
            let newProp: any;
            if (combiningOp) {
                newProp = combine(combiningOp, oldProp, v);
            } else {
                newProp = v;
            }
            if (contingentBase[key]===undefined) {
                contingentBase[key] = Collections.ListMakeHead<any>();
            }
            contingentBase[key].enqueue(newProp);
        }
    }
    return base;
}

export function extend<T>(base: MapLike<T>, extension: MapLike<T>, combiningOp?: ops.ICombiningOp) {
    if (extension !== undefined) {
        if ((typeof extension !== "object")) {
            console.log(`oh my ${extension}`);
        }
        for (let key in extension) {
            let v = extension[key];
            if (v === null) {
                delete base[key];
            } else {
                // TODO: consider some type constraints on ops
                if (combiningOp && (combiningOp.name!=="rewrite")) {
                    base[key] = combine(combiningOp, base[key], v);
                } else {
                    base[key] = v;
                }
            }
        }
    }
    return base;
}

export function extendIfUndefined<T>(base: MapLike<T>, extension: MapLike<T>) {
    if (extension !== undefined) {
        if ((typeof extension !== "object")) {
            console.log(`oh my ${extension}`);
        }
        for (let key in extension) {
            if (base[key] === undefined) {
                base[key] = extension[key];
            }
        }
    }
    return base;
}

/** Create a MapLike with good performance. */
export function createMap<T>(): MapLike<T> {
    const map = Object.create(null); // tslint:disable-line:no-null-keyword

    // Using 'delete' on an object causes V8 to put the object in dictionary mode.
    // This disables creation of hidden classes, which are expensive when an object is
    // constantly changing shape.
    map["__"] = undefined;
    delete map["__"];

    return map;
}

