// tslint:disable

export class Property {
    name: string;
    value: string;
    id: number;
}

export interface MapLike<T> {
    [index: string]: T;
}

export class PropertySet {
    propertyMap: MapLike<Property> = createMap<Property>();
}

export interface PropertyDictionary {
    internProperty(name: string, value: string): Property;
}

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

export function makePropertyDictionary(): PropertyDictionary {
    let properties: Property[] = [];
    let propertyMap: MapLike<Property> = createMap<Property>();
    function internProperty(name: string, value: string) {
        let key = name + "_:_" + value;
        let prop = propertyMap[key];
        if (!prop) {
            prop = <Property>{
                name: name,
                value: value,
                id: properties.length
            }
            properties.push(prop);
            propertyMap[key] = prop;
        }
        return prop;
    }
    return {
        internProperty: internProperty
    }
}