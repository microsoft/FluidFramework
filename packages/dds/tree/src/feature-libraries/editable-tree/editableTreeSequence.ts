/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ITreeSubscriptionCursor, TreeNavigationResult } from "../../forest";
import { NamedTreeSchema, TreeSchemaIdentifier, lookupTreeSchema } from "../../schema-stored";
import { Anchor, FieldKey } from "../../tree";
import {
    EditableTree,
    EditableTreeOrPrimitive,
    getTypeSymbol,
    inProxyOrUnwrap,
    ProxyTarget,
    proxyTargetSymbol,
    UnwrappedEditableField,
} from "./editableTree";
import { ProxyContext } from "./editableTreeContext";
import { AdaptingProxyHandler, getArrayOwnKeys, keyIsValidIndex } from "./utilities";

/**
 * Sequence field nodes as a sequence of EditableTrees or primitive values (if unwrapped).
 */
export interface EditableTreeSequence<T extends EditableTreeOrPrimitive = EditableTreeOrPrimitive>
    extends ArrayLike<T> {
    /**
     * A function to get the type of a node or the type of a primary field if index is not provided.
     * If this node is well-formed, it must follow this schema.
     * @param index - if index is supplied, returns the type of a node
     * @param nameOnly - if true, returns only the type identifier
     */
    readonly [getTypeSymbol]: (
        index?: number,
        nameOnly?: boolean,
    ) => NamedTreeSchema | TreeSchemaIdentifier | undefined;

    /**
     * Stores the target for the proxy which implements reading and writing for this sequence field.
     * The details of this object are implementation details,
     * but the presence of this symbol can be used to separate EditableTrees from other types.
     */
    readonly [proxyTargetSymbol]: object;

    [Symbol.iterator](): IterableIterator<T>;
}

/**
 * A Proxy target, which together with a `getSequenceHandler()` implements a basic read/write access to
 * the sequence fields by means of the cursors.
 * It actively uses `ProxyTarget` to delegate handling of anchors and cursors i.e. it re-uses
 * the cursor of that target.
 */
export class ProxyTargetSequence<T extends EditableTreeOrPrimitive = EditableTreeOrPrimitive>
    implements ArrayLike<T>
{
    private offset: number = 0;

    /**
     * @param targetDelegate - the proxy target delegate. Used to avoid code duplicates for cursors, anchors, etc.
     * Its cursor must point to the first node of the field, if the field is not empty.
     * @param unwarpped - stores an information if it was requested to unwrap the field.
     * All nodes are becoming unwrapped or not based on this property.
     * @param primaryKey - The key of the primary field (see 'getPrimaryField').
     * As the cursor points to the field sequence, in some cases it is necessary to navigate up
     * to the field (e.g. to get its type). This key is used to restore the position.
     */
    static create(
        targetDelegate: ProxyTarget,
        unwrapped: true,
        primaryKey?: FieldKey,
    ): ProxyTargetSequence;
    static create(
        targetDelegate: ProxyTarget,
        unwrapped: false,
        primaryKey?: FieldKey,
    ): ProxyTargetSequence<EditableTree>;
    static create(
        targetDelegate: ProxyTarget,
        unwrapped: boolean,
        primaryKey?: FieldKey,
    ): ProxyTargetSequence | ProxyTargetSequence<EditableTree> {
        return new ProxyTargetSequence(targetDelegate, unwrapped, primaryKey);
    }

    // See a documentation for `create()` parameters to get their meaning.
    private constructor(
        private readonly targetDelegate: ProxyTarget,
        public readonly unwrapped: boolean,
        private readonly primaryKey?: FieldKey,
    ) {
        if (primaryKey !== undefined) {
            assert(
                unwrapped,
                "Primary field must not be unwrapped into its sequence if not requested",
            );
        }
        const privateProperties: PropertyKey[] = ["length"];
        for (const property of privateProperties) {
            Object.defineProperty(this, property, {
                configurable: false,
                writable: false,
                enumerable: false,
                value: this.length,
            });
        }
    }

    [index: number]: T;

    public get context(): ProxyContext {
        return this.targetDelegate.context;
    }

    public getAnchor(): Anchor {
        return this.targetDelegate.getAnchor();
    }

    public free(): void {
        this.targetDelegate.free();
    }

    public prepareForEdit(): void {
        this.targetDelegate.prepareForEdit();
    }

    private get cursor(): ITreeSubscriptionCursor {
        return this.targetDelegate.cursor;
    }

    public get isEmpty(): boolean {
        // This is based on the fact if navigating to the first node of the field failed
        // when this sequence was created. There are two options:
        // 1) For unwrapped PrimaryField the cursor stays on its parent meaning we can just check it with `getPrimaryArrayKey()`.
        // 2) For implicit sequences, `targetDelegate.isEmpty` must return true.
        return (
            this.targetDelegate.isEmpty ||
            (this.unwrapped && this.targetDelegate.getPrimaryArrayKey() !== undefined)
        );
    }

    public get length(): number {
        return this.isEmpty ? 0 : this.cursor.currentFieldLength();
    }

    public getType(
        index?: number,
        nameOnly = true,
    ): TreeSchemaIdentifier | NamedTreeSchema | undefined {
        let typeName: TreeSchemaIdentifier | undefined;
        if (index === undefined) {
            // Sequences themselves typed only by their primary field, if any.
            if (this.primaryKey !== undefined) {
                if (this.isEmpty) {
                    typeName = this.cursor.type;
                } else if (this.cursor.up() === TreeNavigationResult.Ok) {
                    typeName = this.cursor.type;
                    this.cursor.down(this.primaryKey, this.offset);
                }
            }
        } else if (keyIsValidIndex(index, this.length)) {
            const offset = index - this.offset;
            if (this.cursor.seek(offset) === TreeNavigationResult.Ok) {
                typeName = this.cursor.type;
                this.offset = index;
            }
        }
        return typeName && !nameOnly
            ? { name: typeName, ...lookupTreeSchema(this.context.forest.schema, typeName) }
            : typeName;
    }

    /**
     * Returns sequence nodes lazily (wrapped or unwrapped, see {@link EditableTreeOrPrimitive}).
     * Make sure `keyIsValidIndex` is called before calling this,
     * as this function only asserts indices implicitly when navigating with a cursor.
     */
    public proxifyNode(index: number): T {
        const offset = index - this.offset;
        const result = this.cursor.seek(offset);
        assert(result === TreeNavigationResult.Ok, "Cannot navigate to the given index.");
        this.offset = index;
        return inProxyOrUnwrap(new ProxyTarget(this.context, this.cursor), this.unwrapped) as T;
    }

    /**
     * Unwraps this sequence into array.
     */
    private get asArray(): T[] {
        const array: T[] = [];
        for (let i = 0; i < this.length; i++) {
            array.push(this.proxifyNode(i));
        }
        return array;
    }

    *[Symbol.iterator](): IterableIterator<T> {
        for (const node of this.asArray) {
            yield node;
        }
    }
}

/**
 * Returns a Proxy handler, which together with a {@link ProxyTargetSequence} implements a basic read/write access to
 * the sequence fields by means of the cursors.
 */
export function getSequenceHandler<
    T extends EditableTreeOrPrimitive,
    P extends EditableTreeSequence<T>,
>(): AdaptingProxyHandler<ProxyTargetSequence<T>, P> {
    return {
        get: (target: ProxyTargetSequence<T>, key: string | symbol, receiver: object): unknown => {
            if (typeof key === "string") {
                const length = target.length;
                if (key === "length") {
                    return length;
                } else if (keyIsValidIndex(key, length)) {
                    return target.proxifyNode(Number(key));
                }
                return undefined;
            }
            switch (key) {
                case getTypeSymbol:
                    return target.getType.bind(target);
                case proxyTargetSymbol:
                    return target;
                case Symbol.iterator:
                    return target[Symbol.iterator].bind(target);
                default:
            }
            return undefined;
        },
        set: (
            target: ProxyTargetSequence<T>,
            key: string,
            value: unknown,
            receiver: unknown,
        ): boolean => {
            throw new Error("Not implemented");
        },
        deleteProperty: (target: ProxyTargetSequence<T>, key: string): boolean => {
            throw new Error("Not supported");
        },
        // Include documented symbols and all non-empty fields.
        has: (target: ProxyTargetSequence<T>, key: string | symbol): boolean => {
            if (typeof key === "symbol") {
                switch (key) {
                    case Symbol.iterator:
                    case proxyTargetSymbol:
                    case getTypeSymbol:
                        return true;
                    default:
                }
            } else {
                if (keyIsValidIndex(key, target.length)) {
                    return true;
                }
            }
            return false;
        },
        ownKeys: (target: ProxyTargetSequence<T>): ArrayLike<keyof P> => {
            // This includes 'length' property.
            const keys: string[] = getArrayOwnKeys(target.length);
            return keys as unknown as ArrayLike<keyof P>;
        },
        getOwnPropertyDescriptor: (
            target: ProxyTargetSequence<T>,
            key: string | symbol,
        ): PropertyDescriptor | undefined => {
            // We generally don't want to allow users of the proxy to reconfigure all the properties,
            // but it is a TypeError to return non-configurable for properties that do not exist on target,
            // so they must return true.
            if (typeof key === "symbol") {
                switch (key) {
                    case proxyTargetSymbol:
                        return {
                            configurable: true,
                            enumerable: false,
                            value: target,
                            writable: false,
                        };
                    case getTypeSymbol:
                        return {
                            configurable: true,
                            enumerable: false,
                            value: target.getType.bind(target),
                            writable: false,
                        };
                    default:
                }
            } else {
                if (key === "length") {
                    return {
                        configurable: false,
                        enumerable: false,
                        value: target.length,
                        writable: false,
                    };
                } else if (keyIsValidIndex(key, target.length)) {
                    return {
                        configurable: true,
                        enumerable: true,
                        value: target.proxifyNode(Number(key)),
                        writable: true,
                    };
                }
            }
            return undefined;
        },
    };
}

/**
 * Checks the type of an UnwrappedEditableField.
 */
export function isUnwrappedEditableSequence(
    field: UnwrappedEditableField,
): field is EditableTreeSequence {
    return (
        typeof field === "object" &&
        isProxyTargetSequence(
            field[proxyTargetSymbol] as ProxyTarget | ProxyTargetSequence | undefined,
        )
    );
}

/**
 * Checks the type of a field's proxy target.
 */
export function isProxyTargetSequence<T extends EditableTreeOrPrimitive>(
    target: ProxyTarget | ProxyTargetSequence<T> | undefined,
): target is ProxyTargetSequence<T> {
    return target !== undefined && !(target instanceof ProxyTarget);
}
