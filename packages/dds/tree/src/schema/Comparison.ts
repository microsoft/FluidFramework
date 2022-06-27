/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../util";
import {
    SchemaRepository,
    TreeSchema,
    ValueSchema,
    FieldSchema,
    FieldKind,
} from "./Schema";
import { emptyField } from "./Builders";

/**
 * @returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsTreeSuperset(
    repo: SchemaRepository,
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
        !allowsFieldSuperset(
            repo,
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
                allowsFieldSuperset(
                    repo,
                    repo.lookupGlobalFieldSchema(originalField),
                    emptyField,
                ),
            // true iff the new field can be empty, since it may be empty in original
            (supersetField) =>
                allowsFieldSuperset(
                    repo,
                    emptyField,
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
                allowsFieldSuperset(
                    repo,
                    original.localFields.get(originalField) ?? fail("missing expected field"),
                    superset.extraLocalFields,
                ),
            (supersetField) =>
                allowsFieldSuperset(
                    repo,
                    original.extraLocalFields,
                    superset.localFields.get(supersetField) ?? fail("missing expected field"),
                ),
            (sameField) => allowsFieldSuperset(
                repo,
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
    originalRepo: SchemaRepository,
    original: FieldSchema,
    superset: FieldSchema,
): boolean {
    if (isNeverField(originalRepo, original)) {
        return true;
    }
    if (
        !allowsKindSuperset(
            original.kind,
            superset.kind,
        )
    ) {
        return false;
    }
    if (original.kind === FieldKind.Forbidden) {
        return true;
    }
    if (superset.types === undefined) {
        return true;
    }
    if (original.types === undefined) {
        return false;
    }
    for (const originalType of original.types) {
        if (!superset.types.has(originalType)) {
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
    original: SchemaRepository,
    superset: SchemaRepository,
): boolean {
    for (const [key, schema] of original.globalFieldSchema) {
        // TODO: I think its ok to use the field from superset here, but I should confirm it is, and document why.
        if (
            !allowsFieldSuperset(
                original,
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

/**
 * @returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsKindSuperset(
    original: FieldKind,
    superset: FieldKind,
): boolean {
    return (
        original === superset ||
        superset === FieldKind.Sequence ||
        ((original === FieldKind.Forbidden ||
            original === FieldKind.Value) &&
            superset === FieldKind.Optional)
    );
}

/**
 * @returns false iff any of the call backs returned false.
 */
export function compareSets<T>(
    a: ReadonlySet<T> | ReadonlyMap<T, unknown>,
    b: ReadonlySet<T> | ReadonlyMap<T, unknown>,
    aExtra: (t: T) => boolean,
    bExtra: (t: T) => boolean,
    same: (t: T) => boolean = () => true,
): boolean {
    for (const item of a.keys()) {
        if (!b.has(item)) {
            if (!aExtra(item)) {
                return false;
            }
        } else {
            if (!same(item)) {
                return false;
            }
        }
    }
    for (const item of b.keys()) {
        if (!a.has(item)) {
            if (!bExtra(item)) {
                return false;
            }
        }
    }
    return true;
}

export function isNeverField(
    repo: SchemaRepository,
    field: FieldSchema,
): boolean {
    if (
        field.kind === FieldKind.Value &&
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

export function isNeverTree(repo: SchemaRepository, tree: TreeSchema): boolean {
    if (tree.extraLocalFields.kind === FieldKind.Value) {
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
