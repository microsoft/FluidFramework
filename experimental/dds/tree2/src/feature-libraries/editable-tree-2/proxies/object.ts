/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey } from "../../../core";
import { AllowedTypes, StructSchema } from "../../typed-schema";
import { TypedNodeUnion } from "../editableTreeTypes";
import { getProxyForField } from "./node";

export function createObjectProxy<TTypes extends AllowedTypes>(
	content: TypedNodeUnion<TTypes>,
	schema: StructSchema,
) {
	// To satisfy 'deepEquals' level scrutiny, the target of the proxy must be an object with the same
	// 'null prototype' you would get from on object literal '{}' or 'Object.create(null)'.  This is
	// because 'deepEquals' uses 'Object.getPrototypeOf' as a way to quickly reject objects with different
	// prototype chains.

	// TODO: Although the target is an object literal, it's still worthwhile to try experimenting with
	// a dispatch object to see if it improves performance.
	return new Proxy(
		{},
		{
			get(target, key): unknown {
				const field = content.tryGetField(key as FieldKey);
				return field === undefined ? undefined : getProxyForField(field);
			},
			set(target, key, value) {
				// TODO: Implement set
				return false;
			},
			has: (target, key) => {
				return schema.structFields.has(key as FieldKey);
			},
			ownKeys: (target) => {
				return [...schema.structFields.keys()];
			},
			getOwnPropertyDescriptor: (target, key) => {
				const field = content.tryGetField(key as FieldKey);

				if (field === undefined) {
					return undefined;
				}

				const p: PropertyDescriptor = {
					value: getProxyForField(field),
					writable: true,
					enumerable: true,
					configurable: true, // Must be 'configurable' if property is absent from proxy target.
				};

				return p;
			},
		},
	) as unknown;
}
