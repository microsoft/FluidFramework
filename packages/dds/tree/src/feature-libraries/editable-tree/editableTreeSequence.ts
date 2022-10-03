/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { TypedJsonCursor } from "../../domains";
import { ITreeCursor, ITreeSubscriptionCursor, TreeNavigationResult } from "../../forest";
import { LocalFieldKey, NamedTreeSchema, TreeSchema, TreeSchemaIdentifier, lookupTreeSchema } from "../../schema-stored";
import { Anchor, UpPath, Value } from "../../tree";
import {
    FieldlessEditableTree, getTypeSymbol, inProxyOrUnwrap, insertRootSymbol, ProxyTarget, proxyTargetSymbol,
    UnwrappedEditableTree, valueSymbol,
} from "./editableTree";
import { ProxyContext } from "./editableTreeContext";
import { AdaptingProxyHandler, getFieldSchema, isPrimitive, isPrimitiveValue } from "./utilities";

/**
 * A symbol to append a node to the sequence field in contexts where string keys are already in use for fields.
 */
export const appendNodeSymbol: unique symbol = Symbol("editable-tree:appendNode()");

/**
 * Unwrapped sequence field.
 * 
 * Limited support of unwrapped sequences under a primary key:
 * - set value using assignment by index
 * - append to the tail using `push()` or assignment by index equals length. This is limited to single-type sequences
 * - append to the tail using `appendNodeSymbol`
 * 
 * TODO:
 * - support generic (or implicit) sequences. This should automatically enable lazy access.
 */
export type UnwrappedEditableSequence = FieldlessEditableTree & readonly UnwrappedEditableTree[] & {
    readonly [appendNodeSymbol]: (node: ITreeCursor) => void;
};

/**
 * A Proxy target, which together with a {@link sequenceHandler} implements a basic read/write access to
 * the sequence fields by means of the cursors.
 */
export class ProxyTargetSequence extends Array<ProxyTarget | ProxyTargetSequence> {
    private readonly target: ProxyTarget;
    
    constructor(
        public readonly context: ProxyContext,
        children?: (ProxyTarget | ProxyTargetSequence)[],
        fieldCursor?: ITreeSubscriptionCursor,
    ) {
        super(...children ?? []);
        if (fieldCursor === undefined) {
            const rootCursor = context.forest.allocateCursor();
            const result = context.forest.tryMoveCursorTo(context.forest.root(context.forest.rootField), rootCursor);
            this.target = result === TreeNavigationResult.Ok ? context.createTarget(rootCursor) : context.createEmptyTarget();
            rootCursor.free();
        } else {
            this.target = context.createTarget(fieldCursor);
        }
        const privateProperties: PropertyKey[] = ["target", "context"];
        for (const propertyKey of privateProperties) {
            Object.defineProperty(this, propertyKey,
                { enumerable: false, writable: false, configurable: false, value: Reflect.get(this, propertyKey) });
        }
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

    public get primaryKey(): LocalFieldKey | undefined {
        return this.target.getPrimaryArrayKey();
    }

    public isEmpty(): boolean {
        return this.target.isEmpty();
    }

    public get length(): number {
        const primaryKey = this.primaryKey;
        if (primaryKey !== undefined) {
            return this.cursor.length(primaryKey);
        }
        // TODO: should return a cursor-based length as well
        return super.length;
    }

    get cursor(): ITreeSubscriptionCursor {
        return this.target.cursor;
    }

    public getType(key?: string, nameOnly?: boolean): TreeSchemaIdentifier | TreeSchema | undefined {
        let typeName: TreeSchemaIdentifier | undefined = this.cursor.type;
        const primaryKey = this.primaryKey;
        if (key !== undefined) {
            if (primaryKey !== undefined) {
                const result = this.cursor.down(primaryKey, 0);
                if (result === TreeNavigationResult.Ok) {
                    typeName = this.cursor.seek(Number(key)) === TreeNavigationResult.Ok ? this.cursor.type : undefined;
                    this.cursor.up();
                }
            } else {
                typeName = this.cursor.seek(Number(key)) === TreeNavigationResult.Ok ? this.cursor.type : undefined;
            }
        }
        if (nameOnly) {
            return typeName;
        }
        if (typeName) {
            return lookupTreeSchema(this.context.forest.schema, typeName);
        }
        return undefined;
    }

    /**
     * Sets value of the node if index exists.
     */
    public setValue(index: number, value: Value): boolean {
        const primaryKey = this.primaryKey;
        assert(primaryKey !== undefined, "Not supported");
        assert(this.cursor.down(primaryKey, index) === TreeNavigationResult.Ok, "Cannot navigate to a node to set value");
        const target = this.context.createTarget(this.cursor);
        this.cursor.up();
        const type = target.getType() as TreeSchema;
        assert(isPrimitive(type), `"Set value" is not supported for non-primitive fields`);
        const path = target.getPath();
        assert(path !== undefined, "Can't locate a path to set a value");
        return this.context.setNodeValue(path, value);
    }

    /**
     * Appends a node to a sequence.
     */
    public appendNode(cursor: ITreeCursor): boolean {
        const primaryKey = this.primaryKey;
        const length = this.length;
        assert(primaryKey !== undefined, "Not supported");
        const path = this.getPath();
        if (this.context.insertNode({
            parent: path,
            parentField: primaryKey,
            parentIndex: length,
        }, cursor)) {
            const result = this.cursor.down(primaryKey, length);
            this.push(this.context.createTarget(this.cursor));
            this.cursor.up();
            return result === TreeNavigationResult.Ok;
        }
        return false;
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

    public getInsertRoot() {
        return this.target.insertRoot.bind(this.target);
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
            const length = target.length;
            if (key === "length") {
                return length;
            } else if (index >= 0 && index < length) {
                return inProxyOrUnwrap(target.context, target[index]);
            }
        }
        switch (key) {
            case getTypeSymbol:
                return target.getType.bind(target);
            case valueSymbol:
            case proxyTargetSymbol:
                return target;
            case appendNodeSymbol:
                return target.appendNode.bind(target);
            default:
                return Reflect.get(target, key);
        }
    },
    set: (target: ProxyTargetSequence, key: string, value: unknown, receiver: unknown): boolean => {
        const length = target.length;
        if (key === "length") {
            return length === value;
        }
        const index = Number(key);
        if (index >= 0 && index < length) {
            return target.setValue(index, value);
        } else if (index === length) {
            // this covers head assignment and push() for a single-typed sequence field
            assert(target.primaryKey !== undefined, "Not supported");
            const fieldSchema = getFieldSchema(target.getType() as TreeSchema, target.primaryKey);
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
    // Include documented symbols (except value when value is undefined) and all non-empty fields.
    has: (target: ProxyTargetSequence, key: string | symbol): boolean => {
        if (typeof key === "symbol") {
            switch (key) {
                case proxyTargetSymbol:
                    return true;
                case getTypeSymbol:
                case valueSymbol:
                case appendNodeSymbol:
                    return !target.isEmpty();
                case insertRootSymbol:
                    return target.isEmpty();
                default:
                    return Reflect.has(target, key);
            }
        }
        return Reflect.has(target, key);
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
                // eslint-disable-next-line unicorn/prefer-switch
                if (key === proxyTargetSymbol || key === valueSymbol) {
                    return { configurable: true, enumerable: false, value: target, writable: false };
                } else if (key === getTypeSymbol) {
                    return { configurable: true, enumerable: false, value: target.getType.bind(target), writable: false };
                } else if (key === appendNodeSymbol) {
                    return { configurable: true, enumerable: false, value: target.appendNode.bind(target), writable: false };
                }
            }
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
    },
};
