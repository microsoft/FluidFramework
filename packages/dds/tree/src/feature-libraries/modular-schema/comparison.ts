/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { compareSets, fail } from "../../util";
import {
    TreeSchema,
    ValueSchema,
    FieldSchema,
    TreeTypeSet,
    StoredSchemaRepository,
} from "../../schema-stored";
import { FullSchemaPolicy, Multiplicity } from "./fieldKind";

export type SchemaRepo = StoredSchemaRepository<FullSchemaPolicy>;

/**
 * @returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsTreeSuperset(
    repo: SchemaRepo,
    original: TreeSchema,
    superset: TreeSchema,
): boolean {
    if (isNeverTree(repo, original)) {
        return true;
    }
    if (!allowsValueSuperset(original.value, superset.value)) {
        return false;
    }
    if (
        !repo.policy.allowsFieldSuperset(
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
        !compareSets(
            original.globalFields,
            superset.globalFields,
            // true iff the original field must always be empty, or superset supports extra global fields.
            (originalField) =>
                superset.extraGlobalFields ||
                repo.policy.allowsFieldSuperset(
                    repo.lookupGlobalFieldSchema(originalField),
                    repo.policy.defaultGlobalFieldSchema,
                ),
            // true iff the new field can be empty, since it may be empty in original
            (supersetField) =>
                repo.policy.allowsFieldSuperset(
                    repo.policy.defaultGlobalFieldSchema,
                    repo.lookupGlobalFieldSchema(supersetField),
                ),
        )
    ) {
        return false;
    }

    if (
        !compareSets(
            original.localFields,
            superset.localFields,
            (originalField) =>
                repo.policy.allowsFieldSuperset(
                    original.localFields.get(originalField) ?? fail("missing expected field"),
                    superset.extraLocalFields,
                ),
            (supersetField) =>
                repo.policy.allowsFieldSuperset(
                    original.extraLocalFields,
                    superset.localFields.get(supersetField) ?? fail("missing expected field"),
                ),
            (sameField) => repo.policy.allowsFieldSuperset(
                original.localFields.get(sameField) ?? fail("missing expected field"),
                superset.localFields.get(sameField) ?? fail("missing expected field"),
            ),
        )
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
export function allowsValueSuperset(
    original: ValueSchema,
    superset: ValueSchema,
): boolean {
    return original === superset || superset === ValueSchema.Serializable;
}

/**
 * @returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
 export function allowsFieldSuperset(
    policy: FullSchemaPolicy,
    original: FieldSchema,
    superset: FieldSchema,
): boolean {
    return (policy.fieldKinds.get(superset.kind) ?? fail("missing kind")
        ).allowsTreeSupersetOf(original.types, superset);
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
    original: SchemaRepo,
    superset: SchemaRepo,
): boolean {
    for (const [key, schema] of original.globalFieldSchema) {
        // TODO: I think its ok to use the field from superset here, but I should confirm it is, and document why.
        if (
            !original.policy.allowsFieldSuperset(
                schema,
                superset.lookupGlobalFieldSchema(key),
            )
        ) {
            return false;
        }
    }
    for (const [key, schema] of original.treeSchema) {
        // TODO: I think its ok to use the tree from superset here, but I should confirm it is, and document why.
        if (
            !allowsTreeSuperset(
                original,
                schema,
                superset.lookupTreeSchema(key),
            )
        ) {
            return false;
        }
    }
    return true;
}

export function isNeverField(
    repo: SchemaRepo,
    field: FieldSchema,
): boolean {
    if (
        (repo.policy.fieldKinds.get(field.kind) ?? fail("missing field kind")).multiplicity === Multiplicity.Value &&
        field.types !== undefined
    ) {
        for (const type of field.types) {
            if (!isNeverTree(repo, repo.lookupTreeSchema(type))) {
                return false;
            }
        }
        // This field requires at least one child, and there are no types permitted in it that can exist,
        // so this is a never field (field which no sequence of children content could ever be in schema for)
        return true;
    }
    return false;
}

export function isNeverTree(repo: SchemaRepo, tree: TreeSchema): boolean {
    if ((repo.policy.fieldKinds.get(tree.extraLocalFields.kind) ?? fail("missing field kind")).multiplicity
            === Multiplicity.Value) {
        return true;
    }
    for (const field of tree.localFields.values()) {
        // TODO: this can can recurse infinitely for schema that include themselves in a value field.
        // Such schema should either be rejected (as an error here) or considered never (and thus detected by this).
        // THis can be done by passing a set/stack of current types recursively here.
        if (isNeverField(repo, field)) {
            return true;
        }
    }
    for (const field of tree.globalFields) {
        if (isNeverField(repo, repo.lookupGlobalFieldSchema(field))) {
            return true;
        }
    }

    return false;
}
