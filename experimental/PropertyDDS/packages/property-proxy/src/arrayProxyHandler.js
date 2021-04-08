/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-param-reassign */

import { PropertyFactory, BaseProperty } from "@fluid-experimental/property-properties"
import { PropertyProxy, proxySymbol } from './propertyProxy';
import { PropertyProxyErrors } from './errors';
import { Utilities } from './utilities';

/**
 * Set the length of the {@link external:ArrayProperty ArrayProperty} referenced by the inputted {@link ComponentArray}.
 * If the new length is greater than the current length of the {@link external:ArrayProperty ArrayProperty},
 * new empty properties with the same typeid as the {@link external:ArrayProperty ArrayProperty} are appended.
 * If the the new length is smaller than the current length,
 * the appropriate amount of elements is deleted from the end of the {@link external:ArrayProperty ArrayProperty}.
 * @param {ComponentArray} target The {@link ComponentArray} the Proxy handles.
 * @param {Number} length The desired new length of the Array.
 * @return {Boolean} False if the passed length is less than 0, true otherwise.
 * @hidden
 */
function setLength(target, length) {
  const newLength = Number(length) === length ? parseInt(length, 10) : 0;
  if (newLength < 0) {
    throw new RangeError('Invalid array length');
  }

  const property = target.getProperty();
  const currentLength = property.getLength();

  if (newLength === 0) {
    property.clear();
  } else if (currentLength > newLength) {
    // Shorten the array
    Utilities.wrapWithPushPopModifiedEventScope(property,
      () => property.removeRange(newLength, currentLength - newLength));
  } else if (currentLength < newLength) {
    // Fill the array with empty but valid values (instead of 'undefined')
    const itemProps = [];
    for (let i = currentLength; i < newLength; i++) {
      if (PropertyFactory.instanceOf(property, 'Reference', 'array')) {
        itemProps.push('');
      } else {
        itemProps.push(PropertyFactory.create(property.getTypeid()));
      }
    }
    Utilities.wrapWithPushPopModifiedEventScope(property, () => {
      property.insertRange(currentLength, itemProps);
    });
  }
  return true;
}

/**
 * @hidden
 */
const getTrapSpecialCases = ['copyWithin', 'reverse', 'swap'];

/**
 * @hidden
 */
const setTrapSpecialCases = getTrapSpecialCases.concat(['fill', 'sort']);

/**
 * The Proxy Handler that defines the traps for the {@link ComponentArray} class and
 * must be used in conjunction with this class.
 * @hidden
 */
export const arrayProxyHandler = {
  /**
   * The get trap that handles access to properties and functions.
   * @param {ComponentArray} target The {@link ComponentArray} the Proxy handles.
   * @param {String} key The name of the property/function that is to be accessed.
   * @param {Proxy} receiver The proxy
   * @return {Object | external:BaseProperty | Function} The accessed primitive, Property or function.
   */
  get(target, key, receiver) {
    if (typeof target[key] === 'function') {
      if (key === 'constructor') {
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
            target.lastCalledMethod = '';
          }
          return result;
        };
      }
    } else if (key === 'length') {
      return target.getProperty().getLength();
    } else {
      const asteriskFound = Utilities.containsAsterisk(key);
      const caretFound = Utilities.containsCaret(key);
      if (asteriskFound || caretFound) {
        key = key.slice(0, -1);
      }

      if (typeof key !== 'symbol' && key >= 0 && key < target.getProperty().getLength()) {
        const property = target.getProperty();
        const isReferenceArray = PropertyFactory.instanceOf(property, 'Reference', 'array');
        if (isReferenceArray && (asteriskFound || getTrapSpecialCases.includes(target.lastCalledMethod))) {
          return property.getValue(key);
        } else {
          if (asteriskFound) {
            return PropertyProxy.proxify(property.get(key,
              { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS }));
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
   * @param {ComponentArray} target The {@link ComponentArray} the Proxy handles.
   * @param {String} key The name of the property/function that is to be accessed.
   * @return {Object} The Descriptor
   */
  getOwnPropertyDescriptor(target, key) {
    if (key !== 'length') {
      if (key === proxySymbol) {
        return { configurable: true, enumerable: true, value: key, writable: false };
      } else {
        return { configurable: true, enumerable: true,
          value: PropertyProxy.proxify(target.getProperty())[key], writable: true };
      }
    } else {
      return { configurable: false, enumerable: false, value: target.getProperty().getLength(), writable: true };
    }
  },

  /**
   * The trap for the in operator.
   * Forwards the query to the has() method of the {@link external:ArrayProperty ArrayProperty}.
   * @param {ComponentArray} target The {@link ComponentArray} the Proxy handles.
   * @param {String} key The name of the property/function that is to be accessed.
   * @return {Boolean} True if the key is part of the {@link external:ArrayProperty ArrayProperty}, otherwise false.
   */
  has: (target, key) => key === 'swap' || key in [] || key === proxySymbol ||
      (key >= 0 && key < target.getProperty().getLength()),

  /**
   * Trap for the Object.keys().
   * Returns the Ids of the {@link external:ArrayProperty ArrayProperty} as an array.
   * @param {ComponentArray} target The {@link ComponentArray} the Proxy handles.
   * @return {Array | undefined} The array containing the IDs of the {@link external:ArrayProperty ArrayProperty}.
   */
  ownKeys: (target) => Reflect.ownKeys(Array.from(target.getProperty().getEntriesReadOnly())),

  /**
   * The set trap handles setting of properties. If key is a number >= 0 it sets the
   * property at that index in the {@link external:ArrayProperty ArrayProperty}.
   * If the key is 'length' it sets a new length for the {@link external:ArrayProperty ArrayProperty}.
   * Otherwise, it just sets it on the associated {@link ComponentArray}.
   * @param {ComponentArray} target The {@link ComponentArray} the Proxy handles.
   * @param {String} key The name of the property/function that is to be accessed.
   * @param {Object} value The value to be set.
   * @return {Boolean} Returns a boolean.
   */
  set(target, key, value) {
    const asteriskFound = Utilities.containsAsterisk(key);
    if (asteriskFound) {
      key = key.slice(0, -1);
    }

    if (!isNaN(key) && key >= 0) {
      const property = target.getProperty();
      const isReferenceArray = PropertyFactory.instanceOf(property, 'Reference', 'array');

      let insert = false;
      if (key >= property.getLength()) {
        setLength(target, parseInt(key, 10) + 1);
        // Trying to set something that was currently not in the array, means a new reference path is inserted
        insert = true;
      }

      const specialCases = setTrapSpecialCases.includes(target.lastCalledMethod);

      if (isReferenceArray && !specialCases && !asteriskFound && !insert) {
        Utilities.setValueOfReferencedProperty(property, key, value);
      } else {
        if (asteriskFound && !isReferenceArray) {
          throw new Error(PropertyProxyErrors.NON_REFERENCE_ASSIGN);
        }
        if (property.isPrimitiveType() || property.get(key).getContext() === 'single') {
          Utilities.throwOnIterableForSingleProperty(value);
          property.set(key, Utilities.prepareElementForInsertion(property, value, target.lastCalledMethod));
        } else {
          Utilities.assign(property.get(key), value);
        }
      }
      return true;
    } else if (key === 'length') {
      return setLength(target, value);
    } else {
      target[key] = value;
      return true;
    }
  },
};
