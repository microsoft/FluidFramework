/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { brand, fail } from "../../util";
import {
    EmptyKey,
    FieldKey,
    isGlobalFieldKey,
    keyFromSymbol,
    Value,
    TreeSchema,
    ValueSchema,
    FieldSchema,
    LocalFieldKey,
    SchemaDataAndPolicy,
    lookupGlobalFieldSchema,
    TreeSchemaIdentifier,
    lookupTreeSchema,
    TreeValue,
    MapTree,
    ITreeCursor,
} from "../../core";
// TODO:
// This module currently is assuming use of defaultFieldKinds.
// The field kinds should instead come from a view schema registry thats provided somewhere.
import { fieldKinds } from "../defaultFieldKinds";
import { FieldKind, Multiplicity } from "../modular-schema";
import { singleMapTreeCursor } from "../mapTreeCursor";

/**
 * @returns true iff `schema` trees should default to being viewed as just their value when possible.
 *
 * Note that this may return true for some types which can not be unwrapped to just their value,
 * since EditableTree avoids ever unwrapping primitives that are objects
 * so users checking for primitives by type won't be broken.
 * Checking for this object case is done elsewhere.
 */
export function isPrimitive(schema: TreeSchema): boolean {
    // TODO: use a separate `TreeViewSchema` type, with metadata that determines if the type is primitive.
    // Since the above is not done yet, use use a heuristic:
    return (
        schema.value !== ValueSchema.Nothing &&
        schema.localFields.size === 0 &&
        schema.globalFields.size === 0
    );
}

export type PrimitiveValue = string | boolean | number;

export function isPrimitiveValue(nodeValue: Value): nodeValue is PrimitiveValue {
    return nodeValue !== undefined && typeof nodeValue !== "object";
}

export function assertPrimitiveValueType(nodeValue: Value, schema: TreeSchema): void {
    assert(isPrimitiveValue(nodeValue), 0x45b /* The value is not primitive */);
    switch (schema.value) {
        case ValueSchema.String:
            assert(typeof nodeValue === "string", 0x45c /* Expected string */);
            break;
        case ValueSchema.Number:
            assert(typeof nodeValue === "number", 0x45d /* Expected number */);
            break;
        case ValueSchema.Boolean:
            assert(typeof nodeValue === "boolean", 0x45e /* Expected boolean */);
            break;
        default:
            fail("wrong value schema");
    }
}

/**
 * @returns the key and the schema of the primary field out of the given tree schema.
 *
 * See note on {@link EmptyKey} for what is a primary field.
 */
export function getPrimaryField(
    schema: TreeSchema,
): { key: LocalFieldKey; schema: FieldSchema } | undefined {
    // TODO: have a better mechanism for this. See note on EmptyKey.
    const field = schema.localFields.get(EmptyKey);
    if (field === undefined) {
        return field;
    }
    return { key: EmptyKey, schema: field };
}

// TODO: this (and most things in this file) should use ViewSchema, and already have the full kind information.
export function getFieldSchema(
    field: FieldKey,
    schemaData: SchemaDataAndPolicy,
    schema?: TreeSchema,
): FieldSchema {
    if (isGlobalFieldKey(field)) {
        return lookupGlobalFieldSchema(schemaData, keyFromSymbol(field));
    }
    assert(
        schema !== undefined,
        0x423 /* The field is a local field, a parent schema is required. */,
    );
    return schema.localFields.get(field) ?? schema.extraLocalFields;
}

export function getFieldKind(fieldSchema: FieldSchema): FieldKind {
    // TODO:
    // This module currently is assuming use of defaultFieldKinds.
    // The field kinds should instead come from a view schema registry thats provided somewhere.
    return fieldKinds.get(fieldSchema.kind) ?? fail("missing field kind");
}

/**
 * Asserts that the field is not polymorphic i.e. mono-typed and returns this single type.
 */
export function tryGetNodeType(fieldSchema: FieldSchema): TreeSchemaIdentifier {
    if (fieldSchema.types === undefined) debugger;
    const types = fieldSchema.types ?? fail("missing field types");
    assert(types.size === 1, "cannot resolve the type");
    const type = [...types][0];
    return type;
}

/**
 * Variant of ProxyHandler covering when the type of the target and implemented interface are different.
 * Only the parts needed so far are included.
 */
export interface AdaptingProxyHandler<T extends object, TImplements extends object> {
    // apply?(target: T, thisArg: any, argArray: any[]): any;
    // construct?(target: T, argArray: any[], newTarget: Function): object;
    // defineProperty?(target: T, p: string | symbol, attributes: PropertyDescriptor): boolean;
    deleteProperty?(target: T, p: string | symbol): boolean;
    get?(target: T, p: string | symbol, receiver: unknown): unknown;
    getOwnPropertyDescriptor?(target: T, p: string | symbol): PropertyDescriptor | undefined;
    // getPrototypeOf?(target: T): object | null;
    has?(target: T, p: string | symbol): boolean;
    // isExtensible?(target: T): boolean;
    ownKeys?(target: T): ArrayLike<keyof TImplements>;
    // preventExtensions?(target: T): boolean;
    set?(target: T, p: string | symbol, value: unknown, receiver: unknown): boolean;
    // setPrototypeOf?(target: T, v: object | null): boolean;
}

export function adaptWithProxy<From extends object, To extends object>(
    target: From,
    proxyHandler: AdaptingProxyHandler<From, To>,
): To {
    // Proxy constructor assumes handler emulates target's interface.
    // Ours does not, so this cast is required.
    return new Proxy<From>(target, proxyHandler as ProxyHandler<From>) as unknown as To;
}

export function getOwnArrayKeys(length: number): string[] {
    return Object.getOwnPropertyNames(Array.from(Array(length)));
}

export function keyIsValidIndex(key: string | number, length: number): boolean {
    const index = Number(key);
    if (typeof key === "string" && String(index) !== key) return false;
    return Number.isInteger(index) && 0 <= index && index < length;
}

/**
 * Attempts to wrap an arbitrary data into a cursor, trying to resolve data types according to the given schema.
 *
 * Note that the name of this function as well as its return type do not specify the tree format on purpose
 * to encourage a development of support for pluggable formats/cursors in the EditableTree API.
 */
export function tryGetCursorFor(
    schema: SchemaDataAndPolicy,
    fieldSchema: FieldSchema,
    data: unknown,
): ITreeCursor {
    const node = DetachedNode.create(schema, fieldSchema, data);
    return singleMapTreeCursor(node);
}

/**
 * This implementation of the MapTree is written to wrap an arbitrary data with respect to the tree schema.
 *
 * It is used as an intermediate storage for the user data,
 * whenever a user utilizes simple assignments to change an EditableTree,
 * as methods of the EditableTree accept only cursors as an input data.
 */
export class DetachedNode implements MapTree {
    public readonly value?: TreeValue;
    private readonly data?: object;

    constructor(
        public readonly schema: SchemaDataAndPolicy,
        public readonly type: TreeSchemaIdentifier,
        data: unknown,
    ) {
        if (isPrimitiveValue(data)) {
            assertPrimitiveValueType(data, lookupTreeSchema(this.schema, this.type));
            this.value = data;
        } else {
            assert(typeof data === "object" && data !== null, "Data should not be null.");
            this.data = data;
        }
    }

    /**
     * Gets the fields of this node.
     */
    get fields(): Map<FieldKey, DetachedNode[]> {
        const fields: Map<FieldKey, DetachedNode[]> = new Map();
        if (this.data === undefined) return fields;
        const nodeSchema = lookupTreeSchema(this.schema, this.type);
        const primary = getPrimaryField(nodeSchema);
        if (Array.isArray(this.data) || primary !== undefined) {
            assert(primary !== undefined, "expected primary field");
            fields.set(primary.key, this.createField(primary.schema, this.data));
        } else {
            for (const propertyKey of Reflect.ownKeys(this.data)) {
                const childFieldKey: FieldKey = brand(propertyKey);
                const childValue = Reflect.get(this.data, propertyKey);
                const fieldSchema = getFieldSchema(childFieldKey, this.schema, nodeSchema);
                fields.set(childFieldKey, this.createField(fieldSchema, childValue));
            }
        }
        return fields;
    }

    /**
     * Creates the field of this node.
     */
    private createField(fieldSchema: FieldSchema, data: unknown): DetachedNode[] {
        const fieldKind = getFieldKind(fieldSchema);
        if (fieldKind.multiplicity === Multiplicity.Sequence) {
            assert(Array.isArray(data), "expected array");
            return data.map((v) => DetachedNode.create(this.schema, fieldSchema, v));
        } else {
            return [DetachedNode.create(this.schema, fieldSchema, data)];
        }
    }

    /**
     * A helper function to create new nodes in cases, when the node type is unknown upfront.
     */
    static create(
        schema: SchemaDataAndPolicy,
        fieldSchema: FieldSchema,
        data: unknown,
    ): DetachedNode {
        if (data instanceof DetachedNode) {
            if (fieldSchema.types !== undefined) {
                assert(
                    fieldSchema.types.has(data.type),
                    "The data type does not match the field schema.",
                );
            }
            return data;
        }
        return new DetachedNode(schema, tryGetNodeType(fieldSchema), data);
    }
}
