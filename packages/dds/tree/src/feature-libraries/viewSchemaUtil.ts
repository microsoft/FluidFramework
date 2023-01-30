/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	TreeSchemaIdentifier,
	NamedTreeSchema,
	TreeSchemaBuilder,
	Named,
	treeSchema,
} from "../core";
import { emptyField } from "./defaultSchema";

/**
 * Helper for building {@link NamedTreeSchema}.
 */
export function namedTreeSchema(
	data: Partial<TreeSchemaBuilder> & Named<TreeSchemaIdentifier>,
): NamedTreeSchema {
	return {
		name: data.name,
		...treeSchema({ extraLocalFields: emptyField, ...data }),
	};
}

/**
 * @returns a map from name of item with that name from a collection of named items.
 */
export function mapFromNamed<T extends Named<TName>, TName>(named: Iterable<T>): Map<TName, T> {
	const map: Map<TName, T> = new Map();
	for (const item of named) {
		assert(
			!map.has(item.name),
			0x4bb /* cannot build map from named items with colliding names. */,
		);
		map.set(item.name, item);
	}
	return map;
}
