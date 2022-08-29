/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { brand, brandOpaque } from "../util";
import {
    FieldKindIdentifier,
    FieldSchema, GlobalFieldKey, LocalFieldKey, TreeSchema, TreeSchemaIdentifier, ValueSchema,
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
 * LocalFieldKey to use for when there is a collection of items under a tree node
 * that makes up the logical primary significant of that tree.
 */
export const itemsKey: LocalFieldKey = brand("items");

/**
 * GlobalFieldKey to use for the root of documents.
 * TODO: if we do want to standardize on a single value for this,
 * it likely should be namespaced or a UUID to avoid risk of collisions.
 */
export const rootFieldKey = brandOpaque<GlobalFieldKey>("rootFieldKey");

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
