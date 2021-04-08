/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-param-reassign */
import { PropertyFactory, BaseProperty } from "@fluid-experimental/property-properties"

import { ComponentMap } from './componentMap';
import { PropertyProxy } from './propertyProxy';
import { PropertyProxyErrors } from './errors';

/**
 * Utility class for the PropertyProxy proxy that consolidates commonly used functionality.
 * @hidden
 */
export class Utilities {
  /**
   * Wraps a function with push/popModifiedEventScope.
   * @param {external:BaseProperty} property The property that is operated on.
   * @param {Function} updateFunction The function containing the code that modifies properties in the workspace.
   */
  static wrapWithPushPopModifiedEventScope(property, updateFunction) {
    if (property.getWorkspace()) {
      property.getWorkspace().pushModifiedEventScope();
      updateFunction();
      property.getWorkspace().popModifiedEventScope();
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
   * if `property` is not an {@link external:ArrayProperty ArrayProperty} or a {@link external:MapProperty MapProperty}.
   * In that case the returned element will be `element` only if `property` is of a primitive type.
   * @param {external:BaseProperty} property The property that is operated on.
   * @param {Object|external:BaseProperty|Proxy.<external:BaseProperty>} element The element to be inserted.
   * @param {String} [caller] Only used if the property parameter is an {@link external:ArrayProperty ArrayProperty}.
   * Triggers special behavior for the methods copyWithin(), fill(), reverse(), sort().
   * @return {Object} The prepared element that is ready for insertion.
   */
  static prepareElementForInsertion(property, element, caller) {
    // Check if element exists and is a proxied property
    if (element && element.getProperty && PropertyFactory.instanceOf(element.getProperty(), 'BaseProperty')) {
      element = element.getProperty();
    }
    if (PropertyFactory.instanceOf(element, 'BaseProperty')) {
      if (property.isPrimitiveType() &&
          !PropertyFactory.instanceOf(property, 'Reference', 'array') &&
          !PropertyFactory.instanceOf(property, 'Reference', 'map')) {
        if (element.isPrimitiveType()) {
          return element.getValue();
        } else {
          return element.getValues();
        }
      } else {
        // Some special cases to allow out of the box functionality for arrays
        if (element.getParent() && property.getContext() === 'array') {
          if (caller === 'copyWithin' || caller === 'fill') {
            return element.clone();
          } else if (caller === 'reverse' || caller === 'sort' || caller === 'swap') {
            const idxString = element.getRelativePath(element.getParent());
            const idx = parseInt(idxString.substr(1).slice(0, -1), 10);
            const removed = property.remove(idx);
            // Put in a dummy to keep the original array length, will be overwritten anyway
            property.insert(idx, PropertyFactory.create(property.getTypeid(), 'single'));
            return removed;
          } else {
            return element;
          }
        } else {
          return element;
        }
      }
    } else {
      if (property.getContext() !== 'single' && element && typeof element !== 'string' &&
        element[Symbol.iterator] && typeof element[Symbol.iterator] === 'function') {
        throw new Error(PropertyProxyErrors.ITERABLE_INSERTION);
      }
      if (property.getContext() === 'array' || property.getContext() === 'map') {
        if (property.isPrimitiveType() || property.getFullTypeid().includes('array<enum<')) {
          return element;
        } else {
          return PropertyFactory.create(property.getTypeid(), 'single', element);
        }
      } else {
        return element;
      }
    }
  }

  /**
   * Assigns as value property to another property.
   * @param {external:BaseProperty} property The target of the assignation.
   * @param {external:BaseProperty | Object} value The value that is to be assigned.
   */
  static assign(property, value) {
    const context = property.getContext();
    // De-proxify
    if (value && value.getProperty) {
      value = value.getProperty();
    }

    if (context === 'single') {
      // Allow setting the value from a property
      if (PropertyFactory.instanceOf(value, 'BaseProperty')) {
        if (PropertyFactory.instanceOf(property, 'Reference')) {
          property.set(value);
        } else {
          property.deserialize(value.serialize());
        }
      } else {
        Utilities.throwOnIterableForSingleProperty(value);
        if (property.isPrimitiveType()) {
          property.setValue(value);
        } else {
          property.setValues(value);
        }
      }
    } else {
      let valueContext;
      if (PropertyFactory.instanceOf(value, 'BaseProperty')) {
        valueContext = value.getContext();
      }

      Utilities.wrapWithPushPopModifiedEventScope(property, () => {
        if (context === 'array') {
          const proxiedArray = PropertyProxy.proxify(property);
          property.clear();
          if (valueContext === 'array') {
            // Assigning an ArrayProperty fills the target with clones of the entries.
            if (value.isPrimitiveType()) {
              proxiedArray.getProperty().setValues(value.getValues());
            } else {
              PropertyProxy.proxify(value).forEach((el) => {
                proxiedArray.push(el.getProperty().clone());
              });
            }
          } else {
            const elements = _getElementsArray(value);
            elements.forEach((el) => proxiedArray.push(el));
          }
        } else if (context === 'map') {
          const proxiedMap = PropertyProxy.proxify(property);
          proxiedMap.clear();
          if (valueContext === 'map') {
            // Assigning a MapProperty fills the target with clones of the entries.
            if (value.isPrimitiveType()) {
              proxiedMap.getProperty().setValues(value.getValues());
            } else {
              PropertyProxy.proxify(value).forEach((el, key) => {
                proxiedMap.set(key, el.getProperty().clone());
              });
            }
          } else {
            const elements = _getElementsArray(value);
            elements.forEach((el) => proxiedMap.set(el[0], el[1]));
          }
        } else { // context === 'set'
          const proxiedSet = PropertyProxy.proxify(property);
          proxiedSet.clear();
          if (valueContext === 'set') {
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
   * @param {Object} value The value to be checked.
   */
  static throwOnIterableForSingleProperty(value) {
    if (value && typeof value !== 'string' && value[Symbol.iterator] && typeof value[Symbol.iterator] === 'function') {
      throw new Error(PropertyProxyErrors.ASSIGN_ITERABLE_TO_SINGLE);
    }
  }

  /**
   * This is a utility function that sets the value of the referenced property.
   * @param {external:BaseProperty} property The ReferenceProperty/ReferenceArrayProperty/ReferenceMapProperty.
   * @param {String|undefined} key The key of the referenced property in the ReferenceArray/Map.
   * @param {external:BaseProperty | Object} value The value to be set.
   */
  static setValueOfReferencedProperty(property, key, value) {
    key = (key === undefined ? [] : [key]);
    if (!property.isReferenceValid(...key)) {
      throw new Error(PropertyProxyErrors.INVALID_REFERENCE);
    }

    const { referencedPropertyParent, relativePathFromParent } =
      PropertyProxy.getParentOfReferencedProperty(property, ...key);
    const proxiedReferencedPropertyParent = PropertyProxy.proxify(referencedPropertyParent);

    if (proxiedReferencedPropertyParent instanceof ComponentMap) {
      proxiedReferencedPropertyParent.set(relativePathFromParent, value);
    } else {
      proxiedReferencedPropertyParent[relativePathFromParent] = value;
    }
  }

  /**
   * Check if a passed in string `key`contains an asterisk.
   * @param {String} key The key to check.
   * @return {Boolean} True if `key` contains an asterisk.
   */
  static containsAsterisk(key) {
    return (String(key) === key && key[key.length - 1] === '*');
  }

  /**
   * Check if a passed in string `key`contains a caret.
   * @param {String} key The key to check.
   * @return {Boolean} True if `key` contains a caret.
   */
  static containsCaret(key) {
    return (String(key) === key && key[key.length - 1] === '^');
  }

  /**
   * This method handles the proxification of child properties and also takes care of the special cases,
   * that arises if an '^' was part of the key `key` that identifies which child of `property` is about to be
   * proxied.
   * @param {external:BaseProperty} property The parent property.
   * @param {String} key The key that determines which child of `property` is proxied.
   * @param {Boolean} caretFound Indicates if the key initially contained a caret at the end.
   * @param {Boolean} [isReferenceCollection] Indicates if `property` is either a
   * ReferenceArray- or ReferenceMapProperty.
   *  @return {Object|Proxy} The newly created proxy if `property` is of a non-primitive type otherwise the value.
   */
  static proxifyInternal(property, key, caretFound, isReferenceCollection = false) {
    const context = property.getContext();
    const propertyAtKey = property.get(key);
    if (PropertyFactory.instanceOf(propertyAtKey, 'BaseProperty')) {
      if (caretFound && propertyAtKey.isPrimitiveType()) {
        if (PropertyFactory.instanceOf(propertyAtKey, 'Enum')) {
          return propertyAtKey.getEnumString();
        } else if (PropertyFactory.instanceOf(propertyAtKey, 'Uint64') ||
          PropertyFactory.instanceOf(propertyAtKey, 'Int64')) {
          return propertyAtKey.toString();
        }
      }
      return PropertyProxy.proxify(propertyAtKey);
    } else {
      // property is a ReferenceProperty that references a primitive entry of a map/set.
      if (caretFound) {
        const contextIsSingle = context === 'single';
        if (!contextIsSingle && isReferenceCollection) {
          const data = PropertyProxy.getParentOfReferencedProperty(property, key);
          property = data.referencedPropertyParent;
          key = data.relativePathFromParent;
        }

        if (contextIsSingle) {
          const data = PropertyProxy.getParentOfReferencedProperty(property.get(key,
            { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS }));
          property = data.referencedPropertyParent;
          key = data.relativePathFromParent;
        }

        const typeid = property.getTypeid();
        const fullTypeid = property.getFullTypeid();
        if (typeid === 'Uint64') {
          return PropertyFactory.create('Uint64', 'single', propertyAtKey).toString();
        } else if (typeid === 'Int64') {
          return PropertyFactory.create('Int64', 'single', propertyAtKey).toString();
        } else if (fullTypeid.includes('<enum<')) {
          return property.getEnumString(key);
        }
      }
      return propertyAtKey;
    }
  }
}

/**
 * Helper that checks if the input is a valid iterable and returns an array containing the entries
 * of the Iterable.
 * @param {Iterable} value The Iterable that contains the entries.
 * @return {Array} An array of the entries contained in the passed Iterable.
 * @hidden
 */
function _getElementsArray(value) {
  if (!value || typeof value[Symbol.iterator] !== 'function' || String(value) === value) {
    throw new Error(PropertyProxyErrors.NON_ITERABLE);
  }
  return [...value];
}
