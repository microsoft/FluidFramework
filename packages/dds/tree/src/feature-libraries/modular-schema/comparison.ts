/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { compareSets, fail } from "../../util";
import { TreeSchema, ValueSchema, FieldSchema, TreeTypeSet, SchemaData } from "../../schema-stored";
import { FullSchemaPolicy, Multiplicity } from "./fieldKind";

/**
 * @returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsTreeSuperset(
    policy: FullSchemaPolicy,
    originalData: SchemaData,
    original: TreeSchema,
    superset: TreeSchema,
): boolean {
    if (isNeverTree(policy, originalData, original)) {
        return true;
    }
    if (!allowsValueSuperset(original.value, superset.value)) {
        return false;
    }
    if (
        !allowsFieldSuperset(
            policy,
            originalData,
            original.extraLocalFields,
            superset.extraLocalFields,
        )
    ) {
        return false;
    }
    if (original.extraGlobalFields && !superset.extraGlobalFields) {
        return false;
    }
    if (
        !compareSets({
            a: original.globalFields,
            b: superset.globalFields,
            // true iff the original field must always be empty, or superset supports extra global fields.
            aExtra: (originalField) =>
                superset.extraGlobalFields ||
                allowsFieldSuperset(
                    policy,
                    originalData,
                    originalData.globalFieldSchema.get(originalField) ??
                        policy.defaultGlobalFieldSchema,
                    policy.defaultGlobalFieldSchema,
                ),
            // true iff the new field can be empty, since it may be empty in original
            bExtra: (supersetField) =>
                allowsFieldSuperset(
                    policy,
                    originalData,
                    policy.defaultGlobalFieldSchema,
                    originalData.globalFieldSchema.get(supersetField) ??
                        policy.defaultGlobalFieldSchema,
                ),
        })
    ) {
        return false;
    }

    if (
        !compareSets({
            a: original.localFields,
            b: superset.localFields,
            aExtra: (originalField) =>
                allowsFieldSuperset(
                    policy,
                    originalData,
                    original.localFields.get(originalField) ?? fail("missing expected field"),
                    superset.extraLocalFields,
                ),
            bExtra: (supersetField) =>
                allowsFieldSuperset(
                    policy,
                    originalData,
                    original.extraLocalFields,
                    superset.localFields.get(supersetField) ?? fail("missing expected field"),
                ),
            same: (sameField) =>
                allowsFieldSuperset(
                    policy,
                    originalData,
                    original.localFields.get(sameField) ?? fail("missing expected field"),
                    superset.localFields.get(sameField) ?? fail("missing expected field"),
                ),
        })
    ) {
        return false;
    }

    return true;
}

/**
 * @returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsValueSuperset(original: ValueSchema, superset: ValueSchema): boolean {
    return original === superset || superset === ValueSchema.Serializable;
}

/**
 * @returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsFieldSuperset(
    policy: FullSchemaPolicy,
    originalData: SchemaData,
    original: FieldSchema,
    superset: FieldSchema,
): boolean {
    return (policy.fieldKinds.get(original.kind) ?? fail("missing kind")).allowsFieldSuperset(
        policy,
        originalData,
        original.types,
        superset,
    );
}

/**
 * @returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsTreeSchemaIdentifierSuperset(
    original: TreeTypeSet,
    superset: TreeTypeSet,
): boolean {
    if (superset === undefined) {
        return true;
    }
    if (original === undefined) {
        return false;
    }
    for (const originalType of original) {
        if (!superset.has(originalType)) {
            return false;
        }
    }
    return true;
}

/**
 * @returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 *
 * A version of this that assumes a specific root field could be slightly more permissive in some simple cases,
 * however if any extra fields and fields with unconstrained types are reachable,
 * it would have to compare everything anyway.
 */
export function allowsRepoSuperset(
    policy: FullSchemaPolicy,
    original: SchemaData,
    superset: SchemaData,
): boolean {
    const fields = new Set([
        ...original.globalFieldSchema.keys(),
        ...superset.globalFieldSchema.keys(),
    ]);
    for (const key of fields) {
        // TODO: I think its ok to use the field from superset here, but I should confirm it is, and document why.
        if (
            !allowsFieldSuperset(
                policy,
                original,
                original.globalFieldSchema.get(key) ?? policy.defaultGlobalFieldSchema,
                superset.globalFieldSchema.get(key) ?? policy.defaultGlobalFieldSchema,
            )
        ) {
            return false;
        }
    }
    for (const [key, schema] of original.treeSchema) {
        // TODO: I think its ok to use the tree from superset here, but I should confirm it is, and document why.
        if (
            !allowsTreeSuperset(
                policy,
                original,
                schema,
                superset.treeSchema.get(key) ?? policy.defaultTreeSchema,
            )
        ) {
            return false;
        }
    }
    return true;
}

export function isNeverField(
    policy: FullSchemaPolicy,
    originalData: SchemaData,
    field: FieldSchema,
): boolean {
    if (
        (policy.fieldKinds.get(field.kind) ?? fail("missing field kind")).multiplicity ===
            Multiplicity.Value &&
        field.types !== undefined
    ) {
        for (const type of field.types) {
            if (
                !isNeverTree(
                    policy,
                    originalData,
                    originalData.treeSchema.get(type) ?? policy.defaultTreeSchema,
                )
            ) {
                return false;
            }
        }
        // This field requires at least one child, and there are no types permitted in it that can exist,
        // so this is a never field (field which no sequence of children content could ever be in schema for)
        return true;
    }
    return false;
}

export function isNeverTree(
    policy: FullSchemaPolicy,
    originalData: SchemaData,
    tree: TreeSchema,
): boolean {
    if (
        (policy.fieldKinds.get(tree.extraLocalFields.kind) ?? fail("missing field kind"))
            .multiplicity === Multiplicity.Value
    ) {
        return true;
    }
    for (const field of tree.localFields.values()) {
        // TODO: this can can recurse infinitely for schema that include themselves in a value field.
        // Such schema should either be rejected (as an error here) or considered never (and thus detected by this).
        // THis can be done by passing a set/stack of current types recursively here.
        if (isNeverField(policy, originalData, field)) {
            return true;
        }
    }
    for (const field of tree.globalFields) {
        const schema = originalData.globalFieldSchema.get(field) ?? policy.defaultGlobalFieldSchema;
        if (isNeverField(policy, originalData, schema)) {
            return true;
        }
    }

    return false;
}
