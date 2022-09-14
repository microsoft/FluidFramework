/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-param-reassign */
import {
    PropertyFactory, ArrayProperty,
    BaseProperty,
    ReferenceProperty,
    ReferenceArrayProperty,
    ReferenceMapProperty,
    ValueProperty,
    ContainerProperty,
    EnumProperty,
    EnumArrayProperty,
    MapProperty,
    SetProperty,
} from "@fluid-experimental/property-properties";

import { ComponentMap } from "./componentMap";
import { PropertyProxy } from "./propertyProxy";
import { PropertyProxyErrors } from "./errors";
import { NonPrimitiveTypes, ReferenceType } from "./interfaces";

// TODO(marcus): this function should be removed in the future and a safer
// way to determine the corrent types is useed

export function forceType<T>(value: any | T): value is T {
    return true;
}

/**
 * Utility class for the PropertyProxy proxy that consolidates commonly used functionality.
 * @hidden
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Utilities {
    /**
    * Wraps a function with push/pophNotificationDelayScope.
    * @param property - The property that is operated on.
    * @param updateFunction - The function containing the code that modifies properties in the workspace.
    */
    export function wrapWithPushPopNotificationDelayScope(property: BaseProperty, updateFunction: () => void) {
        if (property.getWorkspace()) {
            property.getWorkspace().pushNotificationDelayScope();
            updateFunction();
            property.getWorkspace().popNotificationDelayScope();
        } else {
            updateFunction();
        }
    }

    /**
     * Prepares an element for insertion. If `element` is a (proxied) {@link external:BaseProperty BaseProperty}
     * and `property` is of a primitive type the returned element will be a javascript primitive.
     * If `property` is of a non-primitive type the returned element will be `property`. This is only
     * different if `property` is an {@link external:ArrayProperty ArrayProperty} (returns a clone of `element`
     * if `caller` is 'copyWithin' or 'fill' and `element` removed from `property` so that
     * it no longer has a parent for 'reverse' and 'sort).
     * If `element` is not a {@link external:BaseProperty BaseProperty} the returned element will be `element`
     * if `property` is not an {@link external:ArrayProperty ArrayProperty}
     * or a {@link external:MapProperty MapProperty}.
     * In that case the returned element will be `element` only if `property` is of a primitive type.
     * @param property - The property that is operated on.
     * @param element - The element to be inserted.
     * @param caller - Only used if the property parameter is an {@link external:ArrayProperty ArrayProperty}.
     * Triggers special behavior for the methods copyWithin(), fill(), reverse(), sort().
     * @return The prepared element that is ready for insertion.
     */
    export function prepareElementForInsertion(property: BaseProperty, element: BaseProperty | any, caller?: string):
        any {
        // Check if element exists and is a proxied property
        if (element && typeof element.getProperty === "function" &&
            PropertyFactory.instanceOf(element.getProperty(), "BaseProperty")) {
            element = element.getProperty();
        }
        if (PropertyFactory.instanceOf(element, "BaseProperty")) {
            if (property.isPrimitiveType() &&
                !PropertyFactory.instanceOf(property, "Reference", "array") &&
                !PropertyFactory.instanceOf(property, "Reference", "map")) {
                return element.isPrimitiveType() ? element.getValue() : element.getValues();
            } else {
                // Some special cases to allow out of the box functionality for arrays
                if (element.getParent() && property.getContext() === "array" && forceType<ArrayProperty>(property)) {
                    if (caller === "copyWithin" || caller === "fill") {
                        return element.clone();
                    } else if (caller === "reverse" || caller === "sort" || caller === "swap") {
                        const idxString = element.getRelativePath(element.getParent());
                        const idx = parseInt(idxString.substr(1).slice(0, -1), 10);
                        const removed = property.remove(idx);
                        // Put in a dummy to keep the original array length, will be overwritten anyway
                        property.insert(idx, PropertyFactory.create(property.getTypeid(), "single"));
                        return removed;
                    } else {
                        return element;
                    }
                } else {
                    return element;
                }
            }
        } else {
            if (property.getContext() !== "single" && element && typeof element !== "string" &&
                element[Symbol.iterator] && typeof element[Symbol.iterator] === "function") {
                throw new Error(PropertyProxyErrors.ITERABLE_INSERTION);
            }
            if (property.getContext() === "array" || property.getContext() === "map") {
                return property.isPrimitiveType() || property.getFullTypeid().includes("array<enum<")
                    ? element
                    : PropertyFactory.create(property.getTypeid(), "single", element);
            } else {
                return element;
            }
        }
    }

    /**
     * Assigns as value property to another property.
     * @param property - The target of the assignation.
     * @param value - The value that is to be assigned.
     */
    export function assign(property: BaseProperty, value: BaseProperty | any) {
        const context = property.getContext();
        // De-proxify
        if (value?.getProperty) {
            value = value.getProperty();
        }

        if (context === "single") {
            // Allow setting the value from a property
            if (PropertyFactory.instanceOf(value, "BaseProperty")) {
                if (PropertyFactory.instanceOf(property, "Reference") && forceType<ReferenceProperty>(property)) {
                    property.set(value);
                } else {
                    property.deserialize(value.serialize());
                }
            } else {
                throwOnIterableForSingleProperty(value);
                if (property.isPrimitiveType() && forceType<ValueProperty>(property)) {
                    property.setValue(value);
                } else {
                    if (forceType<ContainerProperty>(property)) {
                        property.setValues(value);
                    }
                }
            }
        } else {
            let valueContext;
            if (PropertyFactory.instanceOf(value, "BaseProperty")) {
                valueContext = value.getContext();
            }

            wrapWithPushPopNotificationDelayScope(property, () => {
                if (context === "array" && forceType<ArrayProperty>(property)) {
                    const proxiedArray = PropertyProxy.proxify(property);
                    property.clear();
                    if (valueContext === "array") {
                        // Assigning an ArrayProperty fills the target with clones of the entries.
                        if (value.isPrimitiveType()) {
                            proxiedArray.getProperty().setValues(value.getValues());
                        } else {
                            PropertyProxy.proxify(value as ArrayProperty).forEach((el) => {
                                proxiedArray.push(el.getProperty().clone());
                            });
                        }
                    } else {
                        const elements = _getElementsArray(value);
                        elements.forEach((el) => proxiedArray.push(el));
                    }
                } else if (context === "map" && forceType<MapProperty>(property)) {
                    const proxiedMap = PropertyProxy.proxify(property);
                    proxiedMap.clear();
                    if (valueContext === "map") {
                        // Assigning a MapProperty fills the target with clones of the entries.
                        if (value.isPrimitiveType()) {
                            proxiedMap.getProperty().setValues(value.getValues());
                        } else {
                            PropertyProxy.proxify(value as MapProperty).forEach((el, key) => {
                                proxiedMap.set(key, el.getProperty().clone());
                            });
                        }
                    } else {
                        const elements = _getElementsArray(value);
                        elements.forEach((el) => proxiedMap.set(el[0], el[1]));
                    }
                } else { // context === 'set'
                    const proxiedSet = PropertyProxy.proxify(property as MapProperty);
                    proxiedSet.clear();
                    if (valueContext === "set" && forceType<SetProperty>(value)) {
                        PropertyProxy.proxify(value).forEach((el) => {
                            proxiedSet.add(el.getProperty().clone());
                        });
                    } else {
                        const elements = _getElementsArray(value);
                        elements.forEach((el) => proxiedSet.add(el));
                    }
                }
            });
        }
    }

    /**
     * This function should be called if the target of the assignment is a property that has "single" defined
     * as its context to check if the passed value is an iterable. In that case an Error will be thrown.
     * @param value - The value to be checked.
     */
    export function throwOnIterableForSingleProperty(value: any) {
        if (value && typeof value !== "string" &&
            value[Symbol.iterator] && typeof value[Symbol.iterator] === "function") {
            throw new Error(PropertyProxyErrors.ASSIGN_ITERABLE_TO_SINGLE);
        }
    }

    /**
     * This is a utility function that sets the value of the referenced property.
     * @param property - The ReferenceProperty/ReferenceArrayProperty/ReferenceMapProperty.
     * @param key - The key of the referenced property in the ReferenceArray/Map.
     * @param value - The value to be set.
     */
    export function setValueOfReferencedProperty(
        property: ReferenceProperty | ReferenceArrayProperty | ReferenceMapProperty,
        key: string | number | undefined, value: BaseProperty | any) {
        const keys = (key === undefined ? [] : [key]);

        // TODO(marcus): this cast is a workaround for resolving the type check
        // issue that TS cannot export functionally derive the correct types for isReferenceValid
        if (!(property.isReferenceValid as any)(...keys)) {
            throw new Error(PropertyProxyErrors.INVALID_REFERENCE);
        }

        const { referencedPropertyParent, relativePathFromParent } =
            PropertyProxy.getParentOfReferencedProperty(property, ...keys);
        const proxiedReferencedPropertyParent = PropertyProxy.proxify(referencedPropertyParent as NonPrimitiveTypes);

        if (proxiedReferencedPropertyParent instanceof ComponentMap) {
            proxiedReferencedPropertyParent.set(relativePathFromParent, value);
        } else {
            proxiedReferencedPropertyParent[relativePathFromParent] = value;
        }
    }

    /**
     * Check if a passed in string `key`contains an asterisk.
     * @param key - The key to check.
     * @return True if `key` contains an asterisk.
     */
    export const containsAsterisk = (key: any) => (String(key) === key && key[key.length - 1] === "*");

    /**
     * Check if a passed in string `key`contains a caret.
     * @param key - The key to check.
     * @return True if `key` contains a caret.
     */
    export const containsCaret = (key: string) => (String(key) === key && key[key.length - 1] === "^");

    /**
     * This method handles the proxification of child properties and also takes care of the special cases,
     * that arises if an '^' was part of the key `key` that identifies which child of `property` is about to be
     * proxied.
     * @param property - The parent property.
     * @param key - The key that determines which child of `property` is proxied.
     * @param caretFound - Indicates if the key initially contained a caret at the end.
     * @param isReferenceCollection - Indicates if `property` is either a
     * ReferenceArray- or ReferenceMapProperty.
     * @return {Object|Proxy} The newly created proxy if `property` is of a non-primitive type otherwise the value.
     */
    export function proxifyInternal(property: ContainerProperty | ReferenceType
        , key: string | number,
        caretFound: boolean, isReferenceCollection: boolean = false) {
        const context = property.getContext();
        // TODO(marcus): this cast is a workaround for resolving the type check
        // issue that TS cannot export functionally derive the correct types for get
        const propertyAtKey = (property.get as any)(key)!;
        if (PropertyFactory.instanceOf(propertyAtKey, "BaseProperty")) {
            if (caretFound && propertyAtKey.isPrimitiveType()) {
                if (PropertyFactory.instanceOf(propertyAtKey, "Enum") && forceType<EnumProperty>(propertyAtKey)) {
                    return propertyAtKey.getEnumString();
                } else if (PropertyFactory.instanceOf(propertyAtKey, "Uint64") ||
                    PropertyFactory.instanceOf(propertyAtKey, "Int64")) {
                    return propertyAtKey.toString();
                }
            }
            return PropertyProxy.proxify(propertyAtKey);
        } else {
            // property is a ReferenceProperty that references a primitive entry of a map/set.
            if (caretFound) {
                const contextIsSingle = context === "single";
                let other_property: BaseProperty = property;
                if (!contextIsSingle && isReferenceCollection) {
                    // TODO(marcus): "as" reference type cast is has to be done because we cant differentiate
                    // the types well at the moment
                    const data = PropertyProxy
                        .getParentOfReferencedProperty(property as ReferenceMapProperty | ReferenceArrayProperty, key);
                    other_property = data.referencedPropertyParent;
                    key = data.relativePathFromParent;
                }

                if (contextIsSingle && forceType<string>(key)) {
                    // TODO(marcus): this cast is a workaround for resolving the type check
                    // issue that TS cannot export functionally derive the correct types for get
                    const data = PropertyProxy.getParentOfReferencedProperty((property.get as any)(key,
                        { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS })!);
                    other_property = data.referencedPropertyParent;
                    key = data.relativePathFromParent;
                }

                const typeid = other_property.getTypeid();
                const fullTypeid = other_property.getFullTypeid();
                if (typeid === "Uint64") {
                    return PropertyFactory.create("Uint64", "single", propertyAtKey).toString();
                } else if (typeid === "Int64") {
                    return PropertyFactory.create("Int64", "single", propertyAtKey).toString();
                } else if (fullTypeid.includes("<enum<")
                    && forceType<EnumArrayProperty>(other_property) && forceType<number>(key)) {
                    return other_property.getEnumString(key);
                }
            }
            return propertyAtKey;
        }
    }
}

/**
 * Helper that checks if the input is a valid iterable and returns an array containing the entries
 * of the Iterable.
 * @param value - The Iterable that contains the entries.
 * @return An array of the entries contained in the passed Iterable.
 * @hidden
 */
function _getElementsArray<T = any>(value?: Iterable<T>): T[] {
    if (!value || typeof value[Symbol.iterator] !== "function" || String(value) === value) {
        throw new Error(PropertyProxyErrors.NON_ITERABLE);
    }
    return [...value];
}
