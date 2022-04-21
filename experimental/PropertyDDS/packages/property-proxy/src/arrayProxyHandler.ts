/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-param-reassign */

import { PropertyFactory, BaseProperty, ReferenceArrayProperty } from "@fluid-experimental/property-properties";
import { PropertyProxy, proxySymbol } from "./propertyProxy";
import { PropertyProxyErrors } from "./errors";
import { forceType, Utilities } from "./utilities";
import { ComponentArray } from "./componentArray";

/**
 * Set the length of the {@link external:ArrayProperty ArrayProperty} referenced by the inputted {@link ComponentArray}.
 * If the new length is greater than the current length of the {@link external:ArrayProperty ArrayProperty},
 * new empty properties with the same typeid as the {@link external:ArrayProperty ArrayProperty} are appended.
 * If the the new length is smaller than the current length,
 * the appropriate amount of elements is deleted from the end of the {@link external:ArrayProperty ArrayProperty}.
 * @param target The {@link ComponentArray} the Proxy handles.
 * @param length The desired new length of the Array.
 * @return False if the passed length is less than 0, true otherwise.
 * @hidden
 */
function setLength(target: ComponentArray, length: number) {
    const newLength = Math.floor(length);
    if (newLength < 0 || isNaN(newLength)) {
        throw new RangeError("Invalid array length");
    }

    const property = target.getProperty();
    const currentLength = property.getLength();

    if (newLength === 0) {
        property.clear();
    } else if (currentLength > newLength) {
        // Shorten the array
        Utilities.wrapWithPushPopNotificationDelayScope(property,
            () => property.removeRange(newLength, currentLength - newLength));
    } else if (currentLength < newLength) {
        // Fill the array with empty but valid values (instead of 'undefined')
        const itemProps: (string | BaseProperty)[] = [];
        for (let i = currentLength; i < newLength; i++) {
            if (PropertyFactory.instanceOf(property, "Reference", "array")) {
                itemProps.push("");
            } else {
                itemProps.push(PropertyFactory.create(property.getTypeid()));
            }
        }
        Utilities.wrapWithPushPopNotificationDelayScope(property, () => {
            property.insertRange(currentLength, itemProps);
        });
    }
    return true;
}

/**
 * @hidden
 */
const getTrapSpecialCases = ["copyWithin", "reverse", "swap"];

/**
 * @hidden
 */
const setTrapSpecialCases = getTrapSpecialCases.concat(["fill", "sort"]);

/**
 * The Proxy Handler that defines the traps for the {@link ComponentArray} class and
 * must be used in conjunction with this class.
 * @hidden
 */
export const arrayProxyHandler: ProxyHandler<ComponentArray> = {
    /**
     * The get trap that handles access to properties and functions.
     * @param target The {@link ComponentArray} the Proxy handles.
     * @param  key The name of the property/function that is to be accessed.
     * @param  receiver The proxy
     * @return The accessed primitive, Property or function.
     */
    get(target: ComponentArray, key: string, receiver) {
        if (typeof target[key] === "function") {
            if (key === "constructor") {
                // Always return the constructor for the base Array class.
                return [][key];
            } else {
                const reflected = Reflect.get(target, key);
                return function(...args) {
                    target.lastCalledMethod = key;
                    let result;
                    try {
                        result = Reflect.apply(reflected, receiver, args);
                    } finally {
                        target.lastCalledMethod = "";
                    }
                    return result;
                };
            }
        } else if (key === "length") {
            return target.getProperty().getLength();
        } else {
            const asteriskFound = Utilities.containsAsterisk(key);
            const caretFound = Utilities.containsCaret(key);
            if (asteriskFound || caretFound) {
                key = key.slice(0, -1);
            }

            if (typeof key !== "symbol" && Number(key) >= 0 && Number(key) < target.getProperty().getLength()) {
                const property = target.getProperty();
                const isReferenceArray = PropertyFactory.instanceOf(property, "Reference", "array");
                if (isReferenceArray && (asteriskFound || getTrapSpecialCases.includes(target.lastCalledMethod))) {
                    return property.getValue(key);
                } else {
                    if (asteriskFound) {
                        const property_to_proxy = property.get(key,
                            { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS });
                        if (property_to_proxy) {
                            return PropertyProxy.proxify(property_to_proxy);
                        } else {
                            throw new Error(PropertyProxyErrors.INVALID_PROPERTY);
                        }
                    } else {
                        return Utilities.proxifyInternal(property, key, caretFound, isReferenceArray);
                    }
                }
            }
            return Reflect.get(target, key);
        }
    },

    /**
     * Trap for Object.getOwnPropertyDescriptor().
     * Returns writeable and enumerable descriptor except for length. Required for the ownKeys trap.
     * @param target The {@link ComponentArray} the Proxy handles.
     * @param key The name of the property/function that is to be accessed.
     * @return The Descriptor
     */
    getOwnPropertyDescriptor(target: ComponentArray, key: string | typeof proxySymbol) {
        if (key !== "length") {
            if (key === proxySymbol) {
                return { configurable: true, enumerable: true, value: key, writable: false };
            } else {
                return {
                    configurable: true, enumerable: true,
                    value: PropertyProxy.proxify(target.getProperty())[key], writable: true,
                };
            }
        } else {
            return { configurable: false, enumerable: false, value: target.getProperty().getLength(), writable: true };
        }
    },

    /**
     * The trap for the in operator.
     * @param target The {@link ComponentArray} the Proxy handles.
     * @param key The name of the property/function that is to be accessed.
     * @return if the key is part of the {@link external:ArrayProperty ArrayProperty}, otherwise false.
     */
    has: (target: ComponentArray, key: string | symbol) => {
        switch (typeof key) {
            case "string":
                {
                    if (key === "swap" || key in []) {
                        return true;
                    }
                    // Act like an array.
                    // This means that "0" can be present, but not "0.0", "0.1", "-0", " 0" etc.
                    // Simplest way to check for this is to round trip:
                    const numeric = Number(key);
                    return String(Number(key)) === key &&
                        Number.isInteger(numeric) && numeric >= 0 && numeric < target.getProperty().getLength();
                }
            default:
                return key === proxySymbol;
        }
    },

    /**
     * Trap for the Object.keys().
     * Returns the Ids of the {@link external:ArrayProperty ArrayProperty} as an array.
     * @param target The {@link ComponentArray} the Proxy handles.
     * @return The array containing the IDs of the {@link external:ArrayProperty ArrayProperty}.
     */
    ownKeys: (target: ComponentArray) => Reflect.ownKeys(Array.from(target.getProperty().getIds())),

    /**
     * The set trap handles setting of properties.
     *
     * If key is a numeric string it sets the property at that index in the
     * {@link external:ArrayProperty ArrayProperty}.
     * In this case the key must be a normalized positive integer.
     *
     * If the key is 'length' it sets a new length for the {@link external:ArrayProperty ArrayProperty}.
     *
     * Otherwise, it just sets it on the associated {@link ComponentArray}.
     *
     * @param target The {@link ComponentArray} the Proxy handles.
     * @param key The name of the property/function that is to be accessed.
     * @param value The value to be set.
     * @return Returns a boolean.
     */
    set(target: ComponentArray, key: string | symbol, value: any) {
        // process key for cases like "*1" 1 "string_key", "*string_key"
        let processed_key: string | symbol = key;
        const asteriskFound = Utilities.containsAsterisk(processed_key);
        if (asteriskFound) {
            // if we found an * we can safely treat it as string
            processed_key = (processed_key as string).slice(0, -1);
        }
        // convert strings of numbers to numbers
        const numeric_key = Number(processed_key);
        // handle special cases for strings and numbers
        if (isNaN(numeric_key)) {
            if (processed_key === "length") {
                return setLength(target, Number(value));
            }
            // If we land here there was no special case: simply assign.
            target[processed_key] = value;
            return true;
        } else {
            // Validate numeric property: must be a normalized numeric string for an non-negative integer.
            if (numeric_key < 0 || !Number.isInteger(numeric_key) || String(numeric_key) !== processed_key) {
                throw new Error(PropertyProxyErrors.INVALID_PROPERTY);
            }

            const property = target.getProperty();
            const isReferenceArray = PropertyFactory.instanceOf(property, "Reference", "array");

            let insert = false;
            if (numeric_key >= property.getLength()) {
                setLength(target, numeric_key + 1);
                // Trying to set something that was currently not in the array,
                // means a new reference path is inserted
                insert = true;
            }
            const specialCases = setTrapSpecialCases.includes(target.lastCalledMethod);

            if (isReferenceArray && forceType<ReferenceArrayProperty>(property)
                && !specialCases && !asteriskFound && !insert) {
                Utilities.setValueOfReferencedProperty(property, numeric_key, value);
            } else {
                if (asteriskFound && !isReferenceArray) {
                    throw new Error(PropertyProxyErrors.NON_REFERENCE_ASSIGN);
                }
                if (property.isPrimitiveType() || property.get(numeric_key)!.getContext() === "single") {
                    Utilities.throwOnIterableForSingleProperty(value);
                    property.set(numeric_key,
                        Utilities.prepareElementForInsertion(property, value, target.lastCalledMethod));
                } else {
                    const child = property.get(numeric_key);
                    if (child) {
                        Utilities.assign(child, value);
                    } else {
                        throw new Error(PropertyProxyErrors.INVALID_PROPERTY);
                    }
                }
            }
            return true;
        }
    },
};
