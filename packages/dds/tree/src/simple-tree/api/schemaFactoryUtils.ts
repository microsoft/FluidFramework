/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";

import type { TreeValue } from "../../core/index.js";
import { isReadonlyArray } from "../../util/index.js";
import { isLazy, markSchemaMostDerived, type TreeNodeSchema } from "../core/index.js";
import {
	booleanSchema,
	handleSchema,
	nullSchema,
	numberSchema,
	stringSchema,
} from "../leafNodeSchema.js";

import type { SchemaFactory } from "./schemaFactory.js";

/**
 * Gets the leaf domain schema compatible with a given {@link TreeValue}.
 */
export function schemaFromValue(value: TreeValue): TreeNodeSchema {
	switch (typeof value) {
		case "boolean": {
			return booleanSchema;
		}
		case "number": {
			return numberSchema;
		}
		case "string": {
			return stringSchema;
		}
		case "object": {
			if (value === null) {
				return nullSchema;
			}
			assert(isFluidHandle(value), 0x87e /* invalid TreeValue */);
			return handleSchema;
		}
		default: {
			unreachableCase(value);
		}
	}
}

/**
 * The name of a schema produced by {@link SchemaFactory}, including its optional scope prefix.
 *
 * @system @public
 */
export type ScopedSchemaName<
	TScope extends string | undefined,
	TName extends number | string,
> = TScope extends undefined ? `${TName}` : `${TScope}.${TName}`;
// > = `${TScope extends undefined ? "" : `${TScope}.`}${TName}`;

export function structuralName<const T extends string>(
	collectionName: T,
	allowedTypes: TreeNodeSchema | readonly TreeNodeSchema[],
): `${T}<${string}>` {
	let inner: string;
	if (isReadonlyArray(allowedTypes)) {
		const names = allowedTypes.map((t): string => {
			// Ensure that lazy types (functions) don't slip through here.
			assert(!isLazy(t), 0x83d /* invalid type provided */);
			markSchemaMostDerived(t);
			return t.identifier;
		});
		// Ensure name is order independent
		names.sort();
		// Ensure name can't have collisions by quoting and escaping any quotes in the names of types.
		// Using JSON is a simple way to accomplish this.
		// The outer `[]` around the result were needed so that a single type name "Any" would not collide with the "any" case which used to exist.
		inner = JSON.stringify(names);
	} else {
		return structuralName(collectionName, [allowedTypes]);
	}
	return `${collectionName}<${inner}>`;
}

export function scoped<
	TScope extends string | undefined,
	TName extends number | string,
	Name extends TName | string,
>(factory: SchemaFactory<TScope, TName>, name: Name): ScopedSchemaName<TScope, Name> {
	return (
		factory.scope === undefined ? `${name}` : `${factory.scope}.${name}`
	) as ScopedSchemaName<TScope, Name>;
}
