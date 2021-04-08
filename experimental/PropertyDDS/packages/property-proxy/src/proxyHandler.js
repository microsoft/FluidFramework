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
 * The additional proxy handlers for non-collection type HFDM properties.
 * @hidden
 */
export const proxyHandler = {
  /**
   * The get trap that handles access to properties
   * @param {Object} target The Object that references a non-collection type
   * HFDM {@link external:BaseProperty BaseProperty} the Proxy handles.
   * @param {String} key The name of the property that is to be accessed.
   * @return {Object | external:BaseProperty} The accessed primitive or HFDM Property.
   */
  get(target, key) {
    let asteriskFound = false;
    let caretFound = false;
    if (!(target.getProperty().has(key))) {
      asteriskFound = Utilities.containsAsterisk(key);
      caretFound = Utilities.containsCaret(key);
      if (asteriskFound || caretFound) {
        key = key.slice(0, -1);
      }
    }

    if (target.getProperty().has(key)) {
      // Recursion with proxies
      if (asteriskFound) {
        return PropertyProxy.proxify(target.getProperty().get(key,
          { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS }));
      } else {
        return Utilities.proxifyInternal(target.getProperty(), key, caretFound);
      }
    }
    return Reflect.get(target, key);
  },

  /**
   * The set trap that handles assigning of values to properties. In case the underlying HFDM
   * {@link external:BaseProperty BaseProperty} is a {@link external:NodeProperty NodeProperty}
   * and the key does not yet exist an insertion happens.
   * @param {Object} target The Object that references a non-collection type
   * HFDM {@link external:BaseProperty BaseProperty} the Proxy handles.
   * @param {String} key The name of the property something is assigned to.
   * @param {Object} value The value to be assigned.
   * @return {Boolean} True on success.
   */
  set(target, key, value) {
    const asteriskFound = Utilities.containsAsterisk(key);
    if (asteriskFound) {
      key = key.slice(0, -1);
    }

    if (target.getProperty().has(key)) {
      // Reference properties
      const property = target.getProperty();
      let propertyAtKey = property.get(key,
        { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER });
      const isReferenceProperty = PropertyFactory.instanceOf(propertyAtKey, 'Reference');
      if (!asteriskFound && isReferenceProperty) {
        Utilities.setValueOfReferencedProperty(propertyAtKey, undefined, value);
      } else {
        if (asteriskFound) {
          if (!isReferenceProperty) {
            throw new Error(PropertyProxyErrors.NON_REFERENCE_ASSIGN);
          }
        } else {
          propertyAtKey = property.get(key);
        }
        Utilities.assign(propertyAtKey, value);
      }
      return true;
    } else {
      const property = target.getProperty();
      if (property.isDynamic()) {
        property.insert(key, Utilities.prepareElementForInsertion(property, value));
        return true;
      } else {
        throw new Error(PropertyProxyErrors.NON_DYNAMIC_INSERT);
      }
    }
  },

  /**
   * Traps the `delete`operator and removes the targeted property from the workspace.
   * @param {Object} target The Object that references a non-collection type
   * HFDM {@link external:BaseProperty BaseProperty} the Proxy handles.
   * @param {String} key The name of the property to be deleted.
   * @return {Boolean} Returns `true`on successful removal.
   */
  deleteProperty(target, key) {
    const property = target.getProperty();
    if (property.isDynamic() && property.has(key)) {
      property.remove(key);
      return true;
    } else {
      throw new Error(PropertyProxyErrors.NON_DYNAMIC_REMOVE);
    }
  },

  /**
   * Trap for Object.getOwnPropertyDescriptor().
   * Returns a writeable and enumerable descriptor. Required for the ownKeys trap.
   * @param {Object} target The Object that references a non-collection type
   * HFDM {@link external:BaseProperty BaseProperty} the Proxy handles.
   * @param {String} key The name of the property.
   * @return {Object} The Descriptor
   */
  getOwnPropertyDescriptor(target, key) {
    if (Reflect.has(target.getProperty().getEntriesReadOnly(), key)) {
      return {
        configurable: true,
        enumerable: true,
        value: PropertyProxy.proxify(target.getProperty())[key],
        writable: true,
      };
    } else if (key === proxySymbol) {
      return { configurable: true, enumerable: true, value: key, writable: false };
    } else {
      return undefined;
    }
  },

  /**
   * Trap for the `in` operator.
   * @param {Object} target The Object that references a non-collection type
   * HFDM {@link external:BaseProperty BaseProperty} the Proxy handles.
   * @param {String} key The name of the property.
   * @return {Boolean} true if `key` is a child of the property.
   */
  has: (target, key) => Reflect.has(target.getProperty().getEntriesReadOnly(), key) || key === proxySymbol,

  /**
   * Trap for the Object.keys().
   * Returns the Ids of the ArrayProperty as an array.
   * @param {Object} target The Object that references a non-collection type
   * HFDM {@link external:BaseProperty BaseProperty}
   * the Proxy handles.
   * @return {Array} The array containing the IDs of the {@link external:BaseProperty BaseProperty}.
   */
  ownKeys: (target) => Reflect.ownKeys(target.getProperty().getEntriesReadOnly()),
};
