/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { EmptyKey, Value } from "../../tree";
import { brand, fail } from "../../util";
import { TreeSchema, ValueSchema, FieldSchema, LocalFieldKey } from "../../schema-stored";
// TODO:
// This module currently is assuming use of defaultFieldKinds.
// The field kinds should instead come from a view schema registry thats provided somewhere.
import { fieldKinds } from "../defaultFieldKinds";
import { FieldKind } from "../modular-schema";

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
    return schema.value !== ValueSchema.Nothing &&
        schema.localFields.size === 0 && schema.globalFields.size === 0;
}

export type PrimitiveValue = string | boolean | number;

export function isPrimitiveValue(nodeValue: Value): nodeValue is PrimitiveValue {
    return nodeValue !== undefined && typeof nodeValue !== "object";
}

export function getPrimaryField(schema: TreeSchema): { key: LocalFieldKey; schema: FieldSchema; } | undefined {
    // TODO: have a better mechanism for this. See note on EmptyKey.
    const field = schema.localFields.get(EmptyKey);
    if (field === undefined) {
        return field;
    }
    return { key: EmptyKey, schema: field };
}

// TODO: this (and most things in this file) should use ViewSchema, and already have the full kind information.
export function getFieldSchema(schema: TreeSchema, name: string): FieldSchema {
    // TODO: this assumes the name is a local field key.
    // Eventually support for global field keys should be added somehow.
    // (Maybe not use strings for them at this API level?)
    return schema.localFields.get(brand(name)) ?? schema.extraLocalFields;
}

export function getFieldKind(fieldSchema: FieldSchema): FieldKind {
    // TODO:
    // This module currently is assuming use of defaultFieldKinds.
    // The field kinds should instead come from a view schema registry thats provided somewhere.
    return fieldKinds.get(fieldSchema.kind) ?? fail("missing field kind");
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
    target: From, proxyHandler: AdaptingProxyHandler<From, To>): To {
    // Proxy constructor assumes handler emulates target's interface.
    // Ours does not, so this cast is required.
    return new Proxy<From>(target, proxyHandler as ProxyHandler<From>) as unknown as To;
}

export function getArrayOwnKeys(length: number): string[] {
    return Object.getOwnPropertyNames(Array.from(Array(length)));
}
