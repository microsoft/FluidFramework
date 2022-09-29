/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { brand } from "../util";
import {
    FieldKindIdentifier,
    FieldSchema, GlobalFieldKey, Named, NamedTreeSchema, TreeSchema, TreeSchemaIdentifier, ValueSchema,
} from "./schema";

/**
 * APIs to help build schema.
 *
 * See typedSchema.ts for a wrapper for these APIs that captures the types as TypeScript types
 * in addition to runtime data.
 */

/**
 * Empty readonly set.
 */
export const emptySet: ReadonlySet<never> = new Set();

/**
 * Empty readonly map.
 */
export const emptyMap: ReadonlyMap<never, never> = new Map<never, never>();

/**
 * Helper for building {@link FieldSchema}.
 */
export function fieldSchema(
    kind: { identifier: FieldKindIdentifier; },
    types?: Iterable<TreeSchemaIdentifier>,
): FieldSchema {
    return {
        kind: kind.identifier,
        types: types === undefined ? undefined : new Set(types),
    };
}

const defaultExtraGlobalFields = false;

/**
 * See {@link TreeSchema} for details.
 */
export interface TreeSchemaBuilder {
    readonly localFields?: { [key: string]: FieldSchema; };
    readonly globalFields?: Iterable<GlobalFieldKey>;
    readonly extraLocalFields: FieldSchema;
    readonly extraGlobalFields?: boolean;
    readonly value?: ValueSchema;
}

/**
 * Helper for building {@link TreeSchema}.
 */
export function treeSchema(data: TreeSchemaBuilder): TreeSchema {
    const localFields = new Map();
    const local = data.localFields ?? {};
    // eslint-disable-next-line no-restricted-syntax
    for (const key in local) {
        if (Object.prototype.hasOwnProperty.call(local, key)) {
            localFields.set(brand(key), local[key]);
        }
    }

    return {
        localFields,
        globalFields: new Set(data.globalFields ?? []),
        extraLocalFields: data.extraLocalFields,
        extraGlobalFields: data.extraGlobalFields ?? defaultExtraGlobalFields,
        value: data.value ?? ValueSchema.Nothing,
    };
}

/**
 * Helper for building {@link NamedTreeSchema}.
 */
 export function namedTreeSchema(data: TreeSchemaBuilder & Named<TreeSchemaIdentifier>): NamedTreeSchema {
    return {
        name: data.name,
        ...treeSchema(data),
    };
}
