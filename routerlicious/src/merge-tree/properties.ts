// tslint:disable

export interface MapLike<T> {
    [index: string]: T;
}

// we use any because when you include custom methods 
// such as toJSON(), JSON.stringify accepts most types other
// than functions 
export type PropertySet = MapLike<any>;

// assume these are created with Object.create(null)

export function extend<T>(base: MapLike<T>, extension: MapLike<T>) {
    if (extension !== undefined) {
        if ((typeof extension !== "object")) {
            console.log(`oh my ${extension}`);
        }
        for (let key in extension) {
            base[key] = extension[key];
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

