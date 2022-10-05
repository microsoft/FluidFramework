/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { TypedJsonCursor } from "../../domains";
import { ITreeCursor, ITreeSubscriptionCursor, TreeNavigationResult } from "../../forest";
import { LocalFieldKey, NamedTreeSchema, TreeSchemaIdentifier, lookupTreeSchema, lookupGlobalFieldSchema } from "../../schema-stored";
import { Anchor, detachedFieldAsKey, rootFieldKey, UpPath, Value } from "../../tree";
import {
    EditableTreeOrPrimitive, UnwrappedEditableField, UnwrappedEditableTree,
    getTypeSymbol, insertRootSymbol, proxifyField, ProxyTarget, proxyTargetSymbol,
} from "./editableTree";
import { ProxyContext } from "./editableTreeContext";
import { AdaptingProxyHandler, getFieldSchema, isArrayKey, isPrimitive, isPrimitiveValue } from "./utilities";

/**
 * A symbol to append a node to the sequence field in contexts where string keys are already in use for fields.
 */
export const appendNodeSymbol: unique symbol = Symbol("editable-tree:appendNode()");

/**
 * Unwrapped sequence field.
 * 
 * Limited support of unwrapped sequences, implicit or explicit under a primary key:
 * - set value using assignment by index
 * - append to the tail using `push()` or assignment by index equals length. This is limited to single-type sequences
 * - append to the tail using `appendNodeSymbol`
 */
export type UnwrappedEditableSequence = readonly EditableTreeOrPrimitive[] & {
    /**
     * A function to get the type of a node.
     * If this node is well-formed, it must follow this schema.
     * @param index - if index is supplied, returns the type of a non-sequence child node (if exists)
     * @param nameOnly - if true, returns only the type identifier
     */
    readonly [getTypeSymbol]: (index?: number, nameOnly?: boolean) => NamedTreeSchema | TreeSchemaIdentifier | undefined;

    /**
     * Stores the target for the proxy which implements reading and writing for this sequence field.
     * The details of this object are implementation details,
     * but the presence of this symbol can be used to separate EditableTrees from other types.
     */
    readonly [proxyTargetSymbol]: object;

    /**
     * Appends new node to this sequence field.
     * @param newNodeCursor - a cursor, with which a node can be traversed.
     */
    readonly [appendNodeSymbol]: (newNodeCursor: ITreeCursor) => void;
};

/**
 * A Proxy target, which together with a {@link sequenceHandler} implements a basic read/write access to
 * the sequence fields by means of the cursors.
 */
export class ProxyTargetSequence extends Array<ProxyTarget | ProxyTargetSequence> {
    private readonly target: ProxyTarget;
    
    constructor(
        context: ProxyContext,
        fieldCursor?: ITreeSubscriptionCursor,
        public readonly primaryKey?: LocalFieldKey,
    ) {
        super();
        if (fieldCursor === undefined) {
            const rootCursor = context.forest.allocateCursor();
            const result = context.forest.tryMoveCursorTo(context.forest.root(context.forest.rootField), rootCursor);
            this.target = result === TreeNavigationResult.Ok ? context.createTarget(rootCursor) : context.createEmptyTarget();
            rootCursor.free();
        } else {
            this.target = context.createTarget(fieldCursor);
        }
        const privateProperties: PropertyKey[] = ["target", "primaryKey"];
        for (const propertyKey of privateProperties) {
            Object.defineProperty(this, propertyKey,
                { enumerable: false, writable: false, configurable: false, value: Reflect.get(this, propertyKey) });
        }
    }

    public get context(): ProxyContext {
        return this.target.context;
    }

    public getAnchor(): Anchor {
        return this.target.getAnchor();
    }

    public free(): void {
        this.target.free();
    }

    public prepareForEdit(): void {
        this.target.prepareForEdit();
    }

    public getPath(): UpPath | undefined {
        return this.target.getPath();
    }

    public isEmpty(): boolean {
        return this.target.isEmpty();
    }

    public getLength(): number {
        const primaryKey = this.primaryKey;
        if (primaryKey !== undefined) {
            return this.cursor.length(primaryKey);
        }
        return this.cursor.length();
    }

    get cursor(): ITreeSubscriptionCursor {
        return this.target.cursor;
    }

    public getType(index?: number, nameOnly = true): TreeSchemaIdentifier | NamedTreeSchema | undefined {
        let typeName: TreeSchemaIdentifier | undefined;
        const primaryKey = this.primaryKey;
        if (primaryKey !== undefined) {
            typeName = this.cursor.type;
            if (index !== undefined) {
                const result = this.cursor.down(primaryKey, index);
                if (result === TreeNavigationResult.Ok) {
                    typeName = this.cursor.type;
                    this.cursor.up();
                } else {
                    typeName = undefined;
                }
            }
            if (nameOnly) {
                return typeName;
            }
            if (typeName) {
                return {
                    name: typeName,
                    ...lookupTreeSchema(this.context.forest.schema, typeName),
                };
            }
        // no 'primaryKey' means root as a sequence field => it has no 'treeSchema'
        } else if (index !== undefined) {
            if (this.cursor.seek(index) === TreeNavigationResult.Ok) {
                typeName = this.cursor.type;
                this.cursor.seek(-index);
                if (nameOnly) {
                    return typeName;
                }
                return {
                    name: typeName,
                    ...lookupTreeSchema(this.context.forest.schema, typeName),
                };
            }
        }
        return undefined;
    }

    public proxifyField(index: number): UnwrappedEditableField {
        const primaryKey = this.primaryKey;
        const result = primaryKey !== undefined ? this.cursor.down(primaryKey, index) : this.cursor.seek(index);
        if (result !== TreeNavigationResult.Ok) {
            return undefined;
        }
        const newTarget = this.context.createTarget(this.cursor);
        const newProxifiedField = proxifyField(this.context, newTarget);
        if (primaryKey !== undefined) {
            this.cursor.up();
        } else {
            this.cursor.seek(-index);
        }
        return newProxifiedField;
    }

    /**
     * Sets value of the node if index exists.
     */
    public setValue(index: number, value: Value): boolean {
        const type = this.getType(index, false) as NamedTreeSchema;
        assert(isPrimitive(type), `"Set value" is not supported for non-primitive fields`);
        const primaryKey = this.primaryKey;
        const result = primaryKey !== undefined ? this.cursor.down(primaryKey, index) : this.cursor.seek(index);
        assert(result === TreeNavigationResult.Ok, "Cannot navigate to a node to set value");
        const target = this.context.createTarget(this.cursor);
        if (primaryKey !== undefined) {
            this.cursor.up();
        } else {
            this.cursor.seek(-index);
        }
        const path = target.getPath();
        assert(path !== undefined, "Can't locate a path to set a value");
        return this.context.setNodeValue(path, value);
    }

    /**
     * Appends a node to a sequence.
     */
    public appendNode(cursor: ITreeCursor): boolean {
        const primaryKey = this.primaryKey ?? detachedFieldAsKey(this.context.forest.rootField);
        const length = this.getLength();
        assert(primaryKey !== undefined, "Not supported");
        const path = this.primaryKey === undefined ? undefined : this.getPath();
        return this.context.insertNode({
            parent: path,
            parentField: primaryKey,
            parentIndex: length,
        }, cursor);
    }

    public getIndicesAsStrings(): string[] {
        return Array.from({ length: this.getLength() }, (_: undefined, i: number) => String(i));
    }

    public getInsertRoot() {
        return this.target.insertRoot.bind(this.target);
    }

    /**
     * {@inheritdoc}
     */
    // TODO: (?) return deleted nodes as a detached array sequence
    splice(start: number, deleteCount?: number, ...items: ProxyTarget[]): ProxyTarget[] {
        throw new Error("Not implemented");
    }

    /**
     * {@inheritdoc}
     */
    // TODO: (?) create a copy of a sequence slice as a detached array sequence
    slice(start?: number, end?: number): ProxyTarget[] {
        throw new Error("Not implemented");
    }

    /**
     * {@inheritdoc}
     */
    pop(): ProxyTarget | undefined {
        throw new Error("Not implemented");
    }

    /**
     * {@inheritdoc}
     */
    shift(): ProxyTarget | undefined {
        throw new Error("Not implemented");
    }

    /**
     * {@inheritdoc}
     */
    reverse(): ProxyTarget[] {
        throw new Error("Not implemented");
    }

    /**
     * {@inheritdoc}
     */
    // TODO: returns a detached sequence of copied existing sequence elements and new elements
    concat(): ProxyTarget[] {
        throw new Error("Not implemented");
    }

    /**
     * {@inheritdoc}
     */
    join(separator?: string): string {
        throw new Error("Not implemented");
    }

    /**
     * {@inheritdoc}
     */
    sort(compareFn?: (a: ProxyTarget, b: ProxyTarget) => number): this {
        throw new Error("Not implemented");
    }

    /**
     * {@inheritdoc}
     */
    indexOf(searchElement: ProxyTarget, index?: number): number {
        throw new Error("Not implemented");
    }

    /**
     * {@inheritdoc}
     */
    lastIndexOf(searchElement: ProxyTarget, index?: number): number {
        throw new Error("Not implemented");
    }

    /**
     * {@inheritdoc}
     */
    reduce<U>(
        callbackfn: (previousValue: U, currentValue: ProxyTarget, currentIndex: number, array: ProxyTarget[]) => U,
        initialValue?: U): U {
        throw new Error("Not implemented");
    }

    /**
     * {@inheritdoc}
     */
    reduceRight<U>(
        callbackfn: (previousValue: U, currentValue: ProxyTarget, currentIndex: number, array: ProxyTarget[]) => U,
        initialValue?: U): U {
        throw new Error("Not implemented");
    }

    /**
     * {@inheritdoc}
     */
    filter(predicate: (value: ProxyTarget, index: number, array: ProxyTarget[]) => unknown, thisArg?: any):
        ProxyTarget[] {
        throw new Error("Not implemented");
    }
}

/**
 * A Proxy handler, which together with a {@link ProxyTargetSequence} implements a basic read/write access to
 * the sequence fields by means of the cursors.
 */
export const sequenceHandler: AdaptingProxyHandler<ProxyTargetSequence, UnwrappedEditableSequence> = {
    get: (target: ProxyTargetSequence, key: string | symbol, receiver: object): unknown => {
        if (target.isEmpty()) {
            switch (key) {
                case insertRootSymbol:
                    return target.getInsertRoot();
                case proxyTargetSymbol:
                    return target;
                case "length":
                    return 0;
                default:
                    return undefined;
            }
        }
        if (typeof key === "string") {
            const reflected = Reflect.get(target, key);
            if (typeof reflected === "function") {
                if (key === "constructor") {
                    return [][key];
                }
                return function(...args: unknown[]): unknown {
                    return Reflect.apply(reflected, receiver, args);
                };
            }
            const index = Number(key);
            const length = target.getLength();
            if (key === "length") {
                return length;
            } else if (isArrayKey(key, length)) {
                return target.proxifyField(index);
            }
            return undefined;
        }
        switch (key) {
            case getTypeSymbol:
                return target.getType.bind(target);
            case proxyTargetSymbol:
                return target;
            case appendNodeSymbol:
                return target.appendNode.bind(target);
            default:
                return Reflect.get(target, key);
        }
    },
    set: (target: ProxyTargetSequence, key: string, value: unknown, receiver: unknown): boolean => {
        const length = target.getLength();
        if (key === "length") {
            return length === value;
        }
        const index = Number(key);
        if (isArrayKey(index, length)) {
            return target.setValue(index, value);
        } else if (index === length) {
            // this covers head assignment and push() for a single-typed sequence field
            const fieldSchema = target.primaryKey !== undefined
                ? getFieldSchema(target.getType(undefined, false) as NamedTreeSchema, target.primaryKey)
                : lookupGlobalFieldSchema(target.context.forest.schema, rootFieldKey);
            assert(fieldSchema.types !== undefined && fieldSchema.types.size === 1,
                "Cannot resolve a field type, use 'insertNodeSymbol' instead");
            const name = [...fieldSchema.types][0];
            const type: NamedTreeSchema = { name, ...lookupTreeSchema(target.context.forest.schema, name) };
            const jsonValue = isPrimitiveValue(value) ? value : value as object;
            const schemaCursor = new TypedJsonCursor(target.context.forest.schema, type, jsonValue);
            return target.appendNode(schemaCursor);
        }
        return false;
    },
    deleteProperty: (target: ProxyTargetSequence, key: string): boolean => {
        throw new Error("Not supported");
    },
    // Include documented symbols and all non-empty fields.
    has: (target: ProxyTargetSequence, key: string | symbol): boolean => {
        if (typeof key === "symbol") {
            switch (key) {
                case proxyTargetSymbol:
                    return true;
                case getTypeSymbol:
                case appendNodeSymbol:
                    return !target.isEmpty();
                case insertRootSymbol:
                    return target.isEmpty();
                default:
            }
        } else {
            if (isArrayKey(key, target.getLength())) {
                return true;
            }
        }
        return Reflect.has(target, key);
    },
    ownKeys: (target: ProxyTargetSequence): ArrayLike<keyof readonly UnwrappedEditableTree[]> => {
        const keys: (string | symbol)[] = target.getIndicesAsStrings();
        keys.push(...Reflect.ownKeys(target));
        return keys as ArrayLike<keyof readonly UnwrappedEditableTree[]>;
    },
    getOwnPropertyDescriptor: (target: ProxyTargetSequence, key: string | symbol): PropertyDescriptor | undefined => {
        // We generally don't want to allow users of the proxy to reconfigure all the properties,
        // but it is a TypeError to return non-configurable for properties that do not exist on target,
        // so they must return true.
        if (typeof key === "symbol") {
            if (target.isEmpty()) {
                return key === insertRootSymbol
                    ? { configurable: true, enumerable: false, value: target.getInsertRoot(), writable: false }
                    : key === proxyTargetSymbol
                        ? { configurable: true, enumerable: false, value: target, writable: false }
                        : undefined;
            } else {
                switch(key) {
                    case proxyTargetSymbol:
                        return { configurable: true, enumerable: false, value: target, writable: false };
                    case getTypeSymbol:
                        return { configurable: true, enumerable: false, value: target.getType.bind(target), writable: false };
                    case appendNodeSymbol:
                        return { configurable: true, enumerable: false, value: target.appendNode.bind(target), writable: false };
                    default:
                }
            }
        } else {
            const index = Number(key);
            const length = target.getLength();
            if (key === "length") {
                return { configurable: false, enumerable: false, value: length, writable: true }
            } else if (isArrayKey(index, length)) {
                return {
                    configurable: true,
                    enumerable: true,
                    value: target.proxifyField(index),
                    writable: true,
                };
            }
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
    },
};
