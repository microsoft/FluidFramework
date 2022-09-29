/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Jsonable } from "@fluidframework/datastore-definitions";
import { SynchronousNavigationResult, TreeNavigationResult } from "../../forest";
import { NamedTreeSchema, StoredSchemaRepository, ValueSchema } from "../../schema-stored";
import { FieldKey, keyFromSymbol, TreeType } from "../../tree";
import { brand } from "../../util";
import { isPrimitive } from "../../feature-libraries";
import { JsonCursor } from "./jsonCursor";

/**
 * An extension of JsonCursor, which allows to use simple schemas having no polymorphic nor sequence fields.
 * Used in {@link EditableTree} to support json over JsonableTree as the input type.
 */
// TODO: add support for a custom type resolution.
export class TypedJsonCursor<T> extends JsonCursor<T> {
    private readonly typeStack: NamedTreeSchema[] = [];  // Ancestors traversed to visit this node.
    private currentType: NamedTreeSchema;

    constructor(
        private readonly schema: StoredSchemaRepository,
        type: NamedTreeSchema,
        root: Jsonable<T>,
        parentKey?: FieldKey,
    ) {
        super(root);
        this.currentType = type;
    }

    public down(key: FieldKey, index: number): SynchronousNavigationResult {
        const result = super.down(key, index);

        if (result === TreeNavigationResult.Ok) {
            this.typeStack.push(this.currentType);
            this.currentType = this.tryFindTypeForJsonable(this.currentType, key, this.value as Jsonable<T>);
        }

        return result;
    }

    public up(): SynchronousNavigationResult {
        const result = super.up();
        if (result === TreeNavigationResult.Ok) {
            /* eslint-disable @typescript-eslint/no-non-null-assertion */
            this.currentType = this.typeStack.pop()!;
            /* eslint-enable @typescript-eslint/no-non-null-assertion */
        }
        return result;
    }

    public get type(): TreeType {
        return this.currentType.name;
    }

    public get keys(): Iterable<FieldKey> {
        const keys = super.keys;
        // TODO: implement support to filter out "technical" keys, if any.
        // "Technical" keys, e.g. "typeid", might be defined by implementing custom type resolution logic.
        return keys;
    }

    private tryFindTypeForJsonable(parentType: NamedTreeSchema, key: FieldKey, value: Jsonable<T>): NamedTreeSchema {
        const fieldSchema = typeof key === "symbol"
            ? this.schema.lookupGlobalFieldSchema(keyFromSymbol(key))
            : parentType.localFields.get(key) ?? parentType.extraLocalFields;
        for (const type of fieldSchema.types ?? []) {
            const treeSchema = this.schema.lookupTreeSchema(type);
            if (isPrimitive(treeSchema)) {
                if (
                    (typeof value === "number" && treeSchema.value === ValueSchema.Number) ||
                    (typeof value === "string" && treeSchema.value === ValueSchema.String) ||
                    (typeof value === "boolean" && treeSchema.value === ValueSchema.Boolean)
                ) {
                    return {
                        name: type,
                        ...treeSchema,
                    };
                }
            } else {
                return {
                    name: type,
                    ...treeSchema,
                };
            }
        }
        return {
            name: brand(""),
            ...this.schema.policy.defaultTreeSchema,
        };
    }
}
