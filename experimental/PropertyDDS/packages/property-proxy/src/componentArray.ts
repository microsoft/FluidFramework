/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-param-reassign */

import { ArrayProperty, BaseProperty, PropertyFactory, ValueProperty } from "@fluid-experimental/property-properties";

import { PropertyProxy } from "./propertyProxy";
import { forceType, Utilities } from "./utilities";

/**
 * Creates an iterator that can iterate over an {@link external:ArrayProperty ArrayProperty}.
 * @param target The ComponentArray that holds a reference to the
 * {@link external:ArrayProperty ArrayProperty}.
 * @return {Iterator} The iterator.
 * @hidden
 */
const createArrayIterator = (target: ComponentArray) => function*() {
    for (let i = 0; i < target.getProperty().getLength(); i++) {
        if (PropertyFactory.instanceOf(target.getProperty().get(i)!, "BaseProperty")) {
            yield PropertyProxy.proxify(target.getProperty().get(i)!);
        } else {
            yield target.getProperty().get(i);
        }
    }
};

/**
 * Prepares the elements that are to be inserted into the {@link external:ArrayProperty ArrayProperty}.
 * @param property The ArrayProperty in which elements are to be inserted.
 * @param elements The elements to be inserted.
 * @return The array that contains elements ready for insertion.
 * @hidden
 */
const prepareElementsForInsertion =
    (property: ArrayProperty, elements: (BaseProperty | Record<string, unknown>)[]) =>
        elements.map((element) => Utilities.prepareElementForInsertion(property, element));

/**
 * ComponentArray extends Array to work directly on the data stored in PropertyDDS.
 *  No local copy of the data is maintained.
 * Serves as input for the {@link ComponentArrayProxyHandler}.
 * @extends Array
 * @hidden
 */
class ComponentArray extends Array {
    public lastCalledMethod = "";

    /**
     * Sets the {@link external:ArrayProperty ArrayProperty} to operate on sets the Symbol.iterator attribute.
     * @param property The ArrayProperty to operate on.
     */
    constructor(private readonly property: ArrayProperty) {
        super();
        this.property = property;
        this[Symbol.iterator] = createArrayIterator(this);
    }

    /**
     * Returns the ArrayProperty property.
     * @return The ArrayProperty.
     */
    getProperty() {
        return this.property;
    }

    /**
     * @inheritdoc
     */
    // TODO(marcus): any is a workaround here for now
    includes(searchElement: any, fromIndex) {
        let startSearchIdx = 0;
        if (fromIndex) {
            if (fromIndex >= this.property.getLength()) {
                return false;
            } else if (fromIndex < 0) {
                startSearchIdx = Math.max(0, this.property.getLength() + fromIndex);
            } else {
                startSearchIdx = Math.min(fromIndex, this.property.getLength() - 1);
            }
        }

        // check if a proxied value was passed
        if (searchElement.getProperty) {
            searchElement = searchElement.getProperty();
        }
        for (let i = startSearchIdx; i < this.property.length; ++i) {
            let prop = this.property.get(i)!;
            if (PropertyFactory.instanceOf(prop, "BaseProperty") && prop.isPrimitiveType()
                && forceType<ValueProperty>(prop)) {
                prop = prop.getValue();
            }
            if (prop === searchElement) {
                return true;
            }
        }
        return false;
    }

    /**
     * @inheritdoc
     */
    indexOf(searchElement: any, fromIndex?: number) {
        let startSearchIdx = 0;
        if (fromIndex) {
            if (fromIndex >= this.property.getLength()) {
                return -1;
            } else if (fromIndex < 0) {
                startSearchIdx = Math.max(0, this.property.getLength() + fromIndex);
            } else {
                startSearchIdx = Math.min(fromIndex, this.property.getLength() - 1);
            }
        }

        // check if a proxied value was passed
        if (searchElement.getProperty) {
            searchElement = searchElement.getProperty();
        }
        for (let i = startSearchIdx; i < this.property.length; ++i) {
            let prop = this.property.get(i)!;
            if (PropertyFactory.instanceOf(prop, "BaseProperty") && prop.isPrimitiveType()
                && forceType<ValueProperty>(prop)) {
                prop = prop.getValue();
            }
            if (prop === searchElement) {
                return i;
            }
        }
        return -1;
    }

    /**
     * @inheritdoc
     */
    lastIndexOf(searchElement: any, fromIndex?: number) {
        // check if a proxied value was passed
        if (searchElement.getProperty) {
            searchElement = searchElement.getProperty();
        }

        const startSearchIdx = fromIndex ?
            (fromIndex < 0 ?
                this.property.getLength() + fromIndex :
                Math.min(fromIndex, this.property.getLength() - 1)) :
            this.property.getLength() - 1;

        for (let i = startSearchIdx; i >= 0; i--) {
            let prop = this.property.get(i)!;
            if (PropertyFactory.instanceOf(prop, "BaseProperty") && prop.isPrimitiveType()
                && forceType<ValueProperty>(prop)) {
                prop = prop.getValue();
            }
            if (prop === searchElement) {
                return i;
            }
        }
        return -1;
    }

    /**
     * @inheritdoc
     */
    pop() {
        let popped;
        if (PropertyFactory.instanceOf(this.property, "Reference", "array")) {
            popped = this.property.get(this.property.getLength() - 1);
            this.property.pop();
        } else {
            popped = this.property.pop();
        }
        if (PropertyFactory.instanceOf(popped, "BaseProperty")) {
            return PropertyProxy.proxify(popped);
        } else {
            return popped;
        }
    }

    /**
     * @inheritdoc
     */
    push(...elements) {
        const elementsToAdd = elements || [];
        if (elementsToAdd.length === 0) {
            return this.property.getLength();
        }

        Utilities.wrapWithPushPopNotificationDelayScope(this.property, () => {
            elementsToAdd.forEach((el) => {
                this.property.push(Utilities.prepareElementForInsertion(this.property, el));
            });
        });
        return this.property.getLength();
    }

    /**
     * @inheritdoc
     */
    shift() {
        let first;
        if (PropertyFactory.instanceOf(this.property, "Reference", "array")) {
            first = this.property.get(0);
            this.property.shift();
        } else {
            first = this.property.shift();
        }
        if (PropertyFactory.instanceOf(first, "BaseProperty")) {
            return PropertyProxy.proxify(first);
        } else {
            return first;
        }
    }

    /**
     * @inheritdoc
     */
    sort(compareFunction) {
        this.lastCalledMethod = "sort";
        if (PropertyFactory.instanceOf(this.property, "Reference", "array")) {
            // TODO(marcus): any is a workaround here to make it work
            const referencedAndReference: any[] = [];
            for (let i = 0; i < this.property.getLength(); ++i) {
                const referenced = this.property.get(i)!;
                if (PropertyFactory.instanceOf(referenced, "BaseProperty")) {
                    referencedAndReference.push([PropertyProxy.proxify(referenced), this.property.getValue(i)]);
                } else {
                    referencedAndReference.push([referenced, this.property.getValue(i)]);
                }
            }

            referencedAndReference.sort((a, b) => {
                return compareFunction(a[0], b[0]);
            });

            this.property.setValues(referencedAndReference.map((el) => el[1]));
        } else {
            super.sort(compareFunction);
        }
        this.lastCalledMethod = "";
        return this;
    }

    /**
     * @inheritdoc
     */
    splice(start, deleteCount, ...items) {
        let startValue = Number(start) === start ? parseInt(start, 10) : 0;
        const arrayLength = this.property.getLength();

        // If start is greater than the array, start is set to the length of the array
        if (startValue > arrayLength) { startValue = arrayLength; }
        // If start is negative, we begin from the end of the array
        else if (startValue < 0) {
            startValue = arrayLength + startValue;
            if (startValue < 0) { startValue = 0; }
        }

        // Remove elements from array
        const deleteUntil = Number(deleteCount) === deleteCount &&
            startValue + deleteCount < arrayLength ? deleteCount : arrayLength - startValue;

        // TODO(marcus): any is a workaround
        const removed: any[] = [];
        if (deleteUntil > 0 && startValue < arrayLength) {
            for (let i = startValue; i < startValue + deleteUntil; ++i) {
                removed.push(this.property.get(i)!);
                const lastEntryIdx = removed.length - 1;
                if (PropertyFactory.instanceOf(removed[lastEntryIdx], "BaseProperty")) {
                    removed[lastEntryIdx] = PropertyProxy.proxify(removed[lastEntryIdx]);
                }
            }
            this.property.removeRange(startValue, deleteUntil);
        }

        // Add elements to array
        const itemsToAdd = items || [];
        if (itemsToAdd.length > 0) {
            const preparedElements = prepareElementsForInsertion(this.property, itemsToAdd);
            Utilities.wrapWithPushPopNotificationDelayScope(
                this.property, () => this.property.insertRange(startValue, preparedElements),
            );
        }

        return removed;
    }

    /**
     * Swaps two elements in place in the array.
     * @param idxOne The index of one of the elements to be swapped.
     * @param idxTwo The index of one of the elements to be swapped.
     */
    swap(idxOne: number, idxTwo: number) {
        if (idxOne >= this.property.getLength() || idxTwo >= this.property.getLength()) {
            throw new RangeError("Cannot swap element that is out of range");
        }
        const tmp = this[idxOne];
        this[idxOne] = this[idxTwo];
        this[idxTwo] = tmp;
    }

    /**
     * @inheritdoc
     */
    unshift(...elements) {
        const elementsToAdd = elements || [];
        if (elementsToAdd.length === 0) {
            return this.property.getLength();
        }
        const preparedElements = prepareElementsForInsertion(this.property, elementsToAdd);
        Utilities.wrapWithPushPopNotificationDelayScope(
            this.property, () => this.property.insertRange(0, preparedElements),
        );
        return this.property.getLength();
    }
}

export { ComponentArray };
