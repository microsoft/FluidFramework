/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PathHelper } from "@fluid-experimental/property-changeset";
import {
	ArrayProperty,
	BaseProperty,
	ContainerProperty,
	MapProperty,
	PropertyFactory,
	SetProperty,
	ValueProperty,
} from "@fluid-experimental/property-properties";

import { IParentAndPathOfReferencedProperty } from "./IParentAndPathOfReferencedProperty.js";
import { arrayProxyHandler } from "./arrayProxyHandler.js";
import { ComponentArray } from "./componentArray.js";
import { ComponentMap } from "./componentMap.js";
import { ComponentSet } from "./componentSet.js";
import { PropertyProxyErrors } from "./errors.js";
import { PropertyTypes, ProxyType, ReferenceType } from "./interfaces.js";
import { proxyHandler } from "./proxyHandler.js";
import { forceType } from "./utilities.js";

/**
 * This symbol is available on properties proxied via {@link PropertyProxy.proxify}.
 * @internal
 */
export const proxySymbol = Symbol("property-proxy");

/**
 * Namespace that contains the {@link PropertyProxy.proxify} and {@link PropertyProxy.getParentOfReferencedProperty}
 * functions.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace PropertyProxy {
	/**
	 * This utility function returns the parent property of a referenced property.
	 * @param property - The ReferenceProperty/ReferenceArrayProperty/ReferenceMapProperty.
	 * @param key - The key of the referenced property in the Reference(Array/Map)Property.
	 * @internal
	 */
	export function getParentOfReferencedProperty(
		property: ReferenceType,
		key?: string | number,
	): IParentAndPathOfReferencedProperty {
		const keys = key === undefined ? [] : [key];
		// TODO(marcus): this cast is a workaround for resolving the type check
		// issue that TS cannot statically derive the correct types for getValue
		const path = (property.getValue as any)(...keys);

		// TODO(marcus): this should be the enum type but that is currently difficult to do correctly without
		// changes to path helper
		const types: number[] = [];
		const tokens = PathHelper.tokenizePathString(path, types);

		let referencedPropertyParent;
		let relativePathFromParent;
		// TODO(marcus): this cast is a workaround for resolving the type check
		// issue that TS cannot statically derive the correct types for get
		if (!PropertyFactory.instanceOf((property.get as any)(...keys), "BaseProperty")) {
			if (types.includes(PathHelper.TOKEN_TYPES.ARRAY_TOKEN)) {
				// This happens when accessing a primitive array/map entry
				// Split key into array id and index
				relativePathFromParent = tokens.pop();
				if (tokens[0] === "/") {
					tokens.shift();
					referencedPropertyParent = property.getRoot().get(tokens);
				} else {
					const parent = property.getParent() as ContainerProperty;
					referencedPropertyParent = types.includes(PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN)
						? parent.resolvePath(path.slice(0, path.lastIndexOf("[")))
						: parent.get(tokens);
				}
			} else {
				const parent = property.getParent() as ContainerProperty;
				referencedPropertyParent = parent.resolvePath(`${path}*`);
				relativePathFromParent = undefined;
			}
		} else {
			// TODO(marcus): this cast is a workaround for resolving the type check
			// issue that TS cannot statically derive the correct types for get
			const prop = (property.get as any)(...keys)! as BaseProperty;
			referencedPropertyParent = prop.getParent();
			relativePathFromParent = prop.getRelativePath(referencedPropertyParent);
			relativePathFromParent = PathHelper.tokenizePathString(relativePathFromParent)[0];
		}

		if (
			PropertyFactory.instanceOf(referencedPropertyParent, "Reference") ||
			PropertyFactory.instanceOf(referencedPropertyParent, "Reference", "array") ||
			PropertyFactory.instanceOf(referencedPropertyParent, "Reference", "map")
		) {
			({ referencedPropertyParent, relativePathFromParent } = getParentOfReferencedProperty(
				referencedPropertyParent,
				relativePathFromParent,
			));
		}
		return { referencedPropertyParent, relativePathFromParent };
	}

	/**
	 * Proxify a BaseProperty
	 * This proxy allows to access and modify properties in the workspace in a JavaScript like manner.
	 * When using collection properties the proxy provides access via the matching
	 * JavaScript object e.g. an ArrayProperty maps to an Array.
	 *
	 * Insertion of new properties into the workspace is triggered
	 * if the specified property name does not yet exist on the parent and the parent is dynamic.
	 *
	 * @example
	 *
	 * ```typescript
	 * // The data can be accessed and modified using standard JavaScript syntax. Operations directly
	 * // happen on the PropertyTree data, nothing is cached.
	 * import { PropertyProxy } from '@fluid-experimental/property-proxy';
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
	 * // and operate directly on the PropertyTree data.
	 * const proxiedArray = proxiedWorkspace.someArray;
	 * proxiedArray.sort((a, b) = (b - a));
	 * console.log(proxiedArray.toString()); // 4,3,2,1
	 * console.log(workspace.get('someArray').getValues().toString()); // 4,3,2,1
	 * ```
	 *
	 * @param property - The BaseProperty to be proxied.
	 *
	 * @returns The newly created proxy if `property` is of a non-primitive type otherwise the value.
	 * @internal
	 */
	export function proxify<T extends PropertyTypes>(property: T): ProxyType<T> {
		if (PropertyFactory.instanceOf(property, "BaseProperty")) {
			const context = property.getContext();
			let proxy;
			switch (context) {
				case "array":
					proxy = new Proxy(new ComponentArray(property as ArrayProperty), arrayProxyHandler);
					break;
				case "map":
					proxy = new ComponentMap(property as MapProperty);
					break;
				case "set":
					proxy = new ComponentSet(property as SetProperty);
					break;
				default:
					if (property.isPrimitiveType() && forceType<ValueProperty>(property)) {
						proxy = property.getValue();
					} else {
						const target = {
							getProperty() {
								if (arguments.length > 0) {
									if (
										Array.isArray(arguments[0]) &&
										arguments[0].length >= 2 &&
										arguments[0][1] !== BaseProperty.PATH_TOKENS.REF
									) {
										throw new Error(PropertyProxyErrors.DIRECT_CHILDREN_ONLY);
									}
									// TODO(marcus): this cast is a workaround for resolving the type check
									// issue that TS cannot statically derive the correct types for getValue
									return (property as ContainerProperty).get(...arguments);
								}
								return property;
							},
						};
						proxy = new Proxy(target, proxyHandler);
					}
					break;
			}
			if (!property.isPrimitiveType() && context !== "single") {
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
