/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */

import { PropertyFactory, BaseProperty } from "@fluid-experimental/property-properties";
import { PathHelper } from "@fluid-experimental/property-changeset";

import { arrayProxyHandler } from './arrayProxyHandler';
import { proxyHandler } from './proxyHandler';

import { ComponentArray } from './componentArray';
import { ComponentMap } from './componentMap';
import { ComponentSet } from './componentSet';
import { PropertyProxyErrors } from './errors';

import { IParentAndPathOfReferencedProperty } from './IParentAndPathOfReferencedProperty';

/**
 * This symbol is available on properties proxied via the PropertyProxy.[[proxify]] method.
 */
export const proxySymbol = Symbol('property-proxy');
/**
 * Class that contains the [[proxify]] and [[getParentOfReferencedProperty]] methods.
 * @public
 */
export class PropertyProxy {
  /**
   * This utility function returns the parent property of a referenced property.
   * @param {ReferenceProperty|ReferenceArrayProperty|ReferenceMapProperty} property
   * The ReferenceProperty/ReferenceArrayProperty/ReferenceMapProperty.
   * @param {String} [k] The key of the referenced property in the Reference(Array/Map)Property.
   * @return {IParentAndPathOfReferencedProperty} The parent, a
   * [`BaseProperty`](https://pages.git.autodesk.com/LYNX/HFDM_SDK/doc/latest/LYNX.Property.BaseProperty.html),
   *  and the relative path to the parent as a `string`.
   * @public
   */
  static getParentOfReferencedProperty(property, k) {
    const key = (k === undefined ? [] : [k]);
    const path = property.getValue(...key);
    const types = [];
    const tokens = PathHelper.tokenizePathString(path, types);

    let referencedPropertyParent;
    let relativePathFromParent;
    if (!PropertyFactory.instanceOf(property.get(...key), 'BaseProperty')) {
      if (types.includes(PathHelper.TOKEN_TYPES.ARRAY_TOKEN)) {
        // This happens when accessing a primitive array/map entry
        // Split key into array id and index
        relativePathFromParent = tokens.pop();
        if (tokens[0] === '/') {
          tokens.shift();
          referencedPropertyParent = property.getRoot().get(tokens);
        } else {
          if (types.includes(PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN)) {
            referencedPropertyParent = property.getParent().resolvePath(path.slice(0, path.lastIndexOf('[')));
          } else {
            referencedPropertyParent = property.getParent().get(tokens);
          }
        }
      } else {
        referencedPropertyParent = property.getParent().resolvePath(`${path  }*`);
        relativePathFromParent = undefined;
      }
    } else {
      referencedPropertyParent = property.get(...key).getParent();
      relativePathFromParent = property.get(...key).getRelativePath(referencedPropertyParent);
      relativePathFromParent = PathHelper.tokenizePathString(relativePathFromParent)[0];
    }

    if (PropertyFactory.instanceOf(referencedPropertyParent, 'Reference') ||
        PropertyFactory.instanceOf(referencedPropertyParent, 'Reference', 'array') ||
        PropertyFactory.instanceOf(referencedPropertyParent, 'Reference', 'map')) {
      ({ referencedPropertyParent, relativePathFromParent } =
        PropertyProxy.getParentOfReferencedProperty(referencedPropertyParent, relativePathFromParent));
    }
    return { referencedPropertyParent, relativePathFromParent };
  }

  /**
   * Proxify a
   * [`BaseProperty`](https://pages.git.autodesk.com/LYNX/HFDM_SDK/doc/latest/LYNX.Property.BaseProperty.html).
   * This proxy allows to access and modify properties in the workspace in a JavaScript like manner.
   * When using collection properties the proxy provides access via the matching
   * JavaScript object e.g. an
   * [`ArrayProperty`](https://pages.git.autodesk.com/LYNX/HFDM_SDK/doc/latest/LYNX.Property.ArrayProperty.html)
   * maps to an Array.
   * Insertion of new properties into the workspace is triggered
   * if the specified property name does not yet exist on the parent and the parent is dynamic.
   * @example
   * ```
   *
   * // The data can be accessed and modified using standard JavaScript syntax. Operations directly
   * // happen on the HFDM data, nothing is cached.
   * import {PropertyProxy} from '@adsk/forge-appfw-hfdm-property-proxy';
   *
   * // Given a workspace that contains some properties: someVector2D (with x = 1 and y = 2),
   * // someArray (storing [1, 2, 3, 4], ...
   *
   * // Once a workspace or any property is proxied any children may be accessed via the common
   * // JavaScript access patterns.
   * const proxiedWorkspace = PropertyProxy.proxify(workspace.getRoot());
   * console.log(proxiedWorkspace.someVector2D.x); // 1
   * proxiedWorkspace.someVector2D = {x: 3, y: 4};
   * console.log(workspace.get('someVector2D').get('x').getValue()); // 3
   *
   * // The methods available on the JavaScript Array class are accessible on proxied ArrayProperties
   * // and operate directly on the HFDM data.
   * const proxiedArray = proxiedWorkspace.someArray;
   * proxiedArray.sort((a, b) = (b - a));
   * console.log(proxiedArray.toString()); // 4,3,2,1
   * console.log(workspace.get('someArray').getValues().toString()); // 4,3,2,1
   * ```
   * @param {BaseProperty} property The
   * [`BaseProperty`](https://pages.git.autodesk.com/LYNX/HFDM_SDK/doc/latest/LYNX.Property.BaseProperty.html)
   * to be proxied.
   * @return {Object|Proxy} The newly created proxy if `property` is of a non-primitive type otherwise the value.
   * @public
   */
  static proxify(property) {
    if (PropertyFactory.instanceOf(property, 'BaseProperty')) {
      const context = property.getContext();
      let proxy;
      switch (context) {
        case 'array':
            proxy = new Proxy(new ComponentArray(property), arrayProxyHandler);
          break;
        case 'map':
          proxy = new ComponentMap(property);
          break;
        case 'set':
          proxy = new ComponentSet(property);
          break;
        default:
          if (property.isPrimitiveType()) {
            proxy = property.getValue();
          } else {
            const target = {
              getProperty() {
                if (arguments.length > 0) {
                  if (Array.isArray(arguments[0]) && arguments[0].length >= 2 &&
                    arguments[0][1] !== BaseProperty.PATH_TOKENS.REF) {
                    throw new Error(PropertyProxyErrors.DIRECT_CHILDREN_ONLY);
                  }
                  return property.get.apply(property, arguments);
                }
                return property;
              },
            };
              proxy = new Proxy(target, proxyHandler);
          }
          break;
      }
      if (!property.isPrimitiveType() && (context !== 'single')) {
        Object.defineProperty(proxy, proxySymbol, {
          enumerable: false,
          configurable: true,
          writable: false,
          value: proxySymbol,
        });
      }
      return proxy;
    } else {
      throw new Error(PropertyProxyErrors.INVALID_PROPERTY);
    }
  }
}
