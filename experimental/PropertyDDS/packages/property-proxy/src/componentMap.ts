/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-param-reassign */
import {
    PropertyFactory, BaseProperty,
    MapProperty, ReferenceMapProperty,
} from "@fluid-experimental/property-properties";

import { PropertyProxy } from "./propertyProxy";
import { PropertyProxyErrors } from "./errors";
import { forceType, Utilities } from "./utilities";

/**
 * The function returns an iterator for {@link external:MapProperty MapProperty}.
 * @param {ComponentMap} target The {@link ComponentMap} that holds a reference
 * to the {@link external:MapProperty MapProperty}.
 * @return {Iterator} An iterator.
 * @hidden
 */
const createMapIterator = (target) => function*(): Generator<[any, any]> {
    const property = target.getProperty();
    const keys = property.getIds();
    for (let i = 0; i < keys.length; i++) {
        const propertyAtKey = property.get(keys[i]);
        if (PropertyFactory.instanceOf(propertyAtKey, "BaseProperty")) {
            yield [keys[i], PropertyProxy.proxify(propertyAtKey)];
        } else {
            yield [keys[i], propertyAtKey];
        }
    }
};

/**
 * ComponentMap extends Map in such a way that a referenced {@link external:MapProperty MapProperty}
 * can be modified and accessed directly.
 * @extends Map
 * @hidden
 */
class ComponentMap extends Map {
    // workaround, necessary for typescript to handle Object.defineProperty
    // https://github.com/microsoft/TypeScript/issues/28694
    private readonly property!: MapProperty;
    /**
     * Sets the {@link external:MapProperty MapProperty} to operate on sets the Symbol.iterator attribute.
     * @param property The {@link external:MapProperty MapProperty} to operate on.
     */
    constructor(property: MapProperty) {
        super();
        Object.defineProperty(this, "property", { enumerable: false, value: property });
        this[Symbol.iterator] = createMapIterator(this);
    }

    /**
     * Retrieves the length of the array returned by {@link external:MapProperty#getIds} to infer
     * the size (number of entries).
     * @return The size of the {@link external:MapProperty MapProperty}.
     */
    get size(): number {
        return this.property.getIds().length;
    }

    /**
     * Returns the wrapped {@link external:MapProperty MapProperty} property.
     * @return The wrapped {@link external:MapProperty MapProperty}.
     */
    getProperty(): MapProperty {
        return this.property;
    }

    /**
     * @inheritdoc
     */
    clear(): void {
        const keys = this.property.getIds();
        keys.forEach((id) => {
            this.property.remove(id);
        });
    }

    /**
     * @inheritdoc
     */
    delete(key: string): boolean {
        if (this.property.has(key)) {
            this.property.remove(key);
            return true;
        } else {
            return false;
        }
    }

    /**
     * @inheritdoc
     */
    entries() {
        return createMapIterator(this)();
    }

    /**
     * @inheritdoc
     */
    get(key: string) {
        if (String(key) !== key) {
            return undefined;
        }

        let asteriskFound = false;
        let caretFound = false;
        if (!this.property.has(key)) {
            asteriskFound = Utilities.containsAsterisk(key);
            caretFound = Utilities.containsCaret(key);
            if (asteriskFound || caretFound) {
                key = key.slice(0, -1);
            }
        }

        if (this.property.has(key)) {
            const isReferenceMap = PropertyFactory.instanceOf(this.property, "Reference", "map");
            if (isReferenceMap && asteriskFound) {
                return this.property.getValue(key);
            } else {
                if (asteriskFound) {
                    return PropertyProxy.proxify(this.property.get(key,
                        { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS })!);
                } else {
                    return Utilities.proxifyInternal(this.property, key, caretFound, isReferenceMap);
                }
            }
        } else {
            return undefined;
        }
    }

    /**
     * @inheritdoc
     */
    forEach(func: (value, key, map) => void) {
        const keys = this.property.getIds();
        for (let i = 0; i < keys.length; i++) {
            const value = this.property.get(keys[i])!;
            // TODO(marcus): should this ever not be the case? in case its a value property
            // the proxify method would return the appropriate type like number, string etc.
            // so the else branch is unnecessary ?
            if (PropertyFactory.instanceOf(value, "BaseProperty")) {
                func(PropertyProxy.proxify(value), keys[i], this);
            } else {
                func(value, keys[i], this);
            }
        }
    }

    /**
     * @inheritdoc
     */
    has(key: string) {
        return this.property.has(key);
    }

    /**
     * @inheritdoc
     */
    keys() {
        const keys = this.property.getIds();
        const keyIterator = function*() {
            for (let i = 0; i < keys.length; i++) {
                yield keys[i];
            }
        };
        return keyIterator();
    }

    /**
     * @inheritdoc
     */
    set(key: string, value: any) {
        if (typeof key !== "string") {
            throw new Error(PropertyProxyErrors.ONLY_STRING_KEYS);
        }

        const asteriskFound = Utilities.containsAsterisk(key);
        if (asteriskFound) {
            key = key.slice(0, -1);
        }

        if (this.property.has(key)) {
            if (!asteriskFound && PropertyFactory.instanceOf(this.property, "Reference", "map")
                && forceType<ReferenceMapProperty>(this.property)) {
                Utilities.setValueOfReferencedProperty(this.property, key, value);
            } else {
                if (asteriskFound && !PropertyFactory.instanceOf(this.property, "Reference", "map")) {
                    throw new Error(PropertyProxyErrors.NON_REFERENCE_ASSIGN);
                }
                this.property.set(key, Utilities.prepareElementForInsertion(this.property, value));
            }
        } else {
            this.property.insert(key, Utilities.prepareElementForInsertion(this.property, value));
        }
        return this;
    }

    /**
     * @inheritdoc
     */
    values() {
        const keys = this.property.getIds();
        const valuesIterator = function*(this: ComponentMap) {
            for (let i = 0; i < keys.length; i++) {
                const propertyAtKey = this.property.get(keys[i])!;
                if (PropertyFactory.instanceOf(propertyAtKey, "BaseProperty")) {
                    yield PropertyProxy.proxify(propertyAtKey);
                } else {
                    yield propertyAtKey;
                }
            }
        };

        return valuesIterator.call(this);
    }

    /**
     * @inheritdoc
     */
    toJSON() {
        // TODO(marcus): should this be implemented?
        return {};
    }
}

export { ComponentMap };
