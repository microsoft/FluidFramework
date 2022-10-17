/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Value, Anchor, FieldKey, symbolIsFieldKey } from "../../tree";
import {
    IEditableForest,
    TreeNavigationResult,
    mapCursorField,
    ITreeSubscriptionCursor,
    ITreeSubscriptionCursorState,
} from "../../forest";
import { brand } from "../../util";
import {
    FieldSchema,
    LocalFieldKey,
    TreeSchemaIdentifier,
    NamedTreeSchema,
    ValueSchema,
    lookupTreeSchema,
} from "../../schema-stored";
import { FieldKind, Multiplicity } from "../modular-schema";
import {
    AdaptingProxyHandler,
    adaptWithProxy,
    getFieldKind,
    getFieldSchema,
    getPrimaryField,
    isPrimitive,
    isPrimitiveValue,
    PrimitiveValue,
    keyIsValidIndex,
    getArrayOwnKeys,
} from "./utilities";
import { EditableTreeContext, ProxyContext } from "./editableTreeContext";

/**
 * A symbol for extracting target from editable-tree proxies.
 * Useful for debugging and testing, but not part of the public API.
 */
export const proxyTargetSymbol: unique symbol = Symbol("editable-tree:proxyTarget");

/**
 * A symbol to get a function, which returns the type of a node in contexts
 * where string keys are already in use for fields.
 */
export const getTypeSymbol: unique symbol = Symbol("editable-tree:getType()");

/**
 * A symbol to get the value of a node in contexts where string keys are already in use for fields.
 */
export const valueSymbol: unique symbol = Symbol("editable-tree:value");

/**
 * A symbol to get the anchor of a node in contexts where string keys are already in use for fields.
 */
export const anchorSymbol: unique symbol = Symbol("editable-tree:anchor");

/**
 * A tree which can be traversed and edited.
 *
 * When iterating, only visits non-empty fields.
 * To discover empty fields, inspect the schema using {@link getTypeSymbol}.
 *
 * TODO: support editing.
 */
export interface EditableTree extends Iterable<EditableField> {
    /**
     * A function to get the type of a node.
     * If this node is well-formed, it must follow this schema.
     * @param key - if key is supplied, returns the type of a non-sequence child node (if exists)
     * @param nameOnly - if true, returns only the type identifier
     */
    readonly [getTypeSymbol]: (
        key?: FieldKey,
        nameOnly?: boolean,
    ) => NamedTreeSchema | TreeSchemaIdentifier | undefined;

    /**
     * Value stored on this node.
     */
    readonly [valueSymbol]: Value;

    /**
     * Stores the target for the proxy which implements reading and writing for this node.
     * The details of this object are implementation details,
     * but the presence of this symbol can be used to separate EditableTrees from other types.
     */
    readonly [proxyTargetSymbol]: object;

    /**
     * Anchor to this node.
     * Valid as long as this EditableTree's context is not freed.
     * Might not point to any node if this node is deleted from the document.
     *
     * TODO: When a proper editing API is exposed on EditableTree directly,
     * this should become an implementation detail and rbe removed from this API surface.
     */
    readonly [anchorSymbol]: Anchor;

    /**
     * Fields of this node, indexed by their field keys.
     *
     * This API exposes content in a way depending on the {@link Multiplicity} of the {@link FieldKind}.
     * Sequences (including empty ones) are always exposed as arrays,
     * and everything else is either a single EditableTree or undefined depending on if it's empty.
     */
    readonly [key: FieldKey]: UnwrappedEditableField;
}

/**
 * EditableTree,
 * but with any type that `isPrimitive` unwrapped into the value if that value is a {@link PrimitiveValue}.
 */
export type EditableTreeOrPrimitive = EditableTree | PrimitiveValue;

/**
 * EditableTree, but with these cases of unwrapping:
 * - primitives are unwrapped. See {@link EditableTreeOrPrimitive}.
 * - nodes with PrimaryField (see `getPrimaryField`) are unwrapped to {@link EditableField}.
 * - fields are unwrapped based on their schema's multiplicity. See {@link UnwrappedEditableField}.
 */
export type UnwrappedEditableTree = EditableTreeOrPrimitive | EditableField;

/**
 * A field of an {@link EditableTree} as an array-like sequence of unwrapped nodes (see {@link UnwrappedEditableTree}).
 *
 * The number of nodes depends on a field's multiplicity.
 * When iterating, the nodes are read at once. Use index access to read the nodes "lazily".
 * Use `getWithoutUnwrapping` to get the node without unwrapping.
 */
export interface EditableField extends ArrayLike<UnwrappedEditableTree> {
    /**
     * The `FieldSchema` of this field.
     */
    readonly fieldSchema: FieldSchema;

    /**
     * The `FieldKey` of this field.
     */
    readonly fieldKey: FieldKey;

    /**
     * Gets the type of the node by its index or the "field type" if index is not provided and this is the primary field.
     * If the node is well-formed, it must follow its schema.
     * @param index - if index is provided, returns the type of the node. Otherwise, if this field is the primary field,
     * returns the type of the parent node this primary field belongs to.
     * @param nameOnly - if true, returns only the type identifier.
     */
    getType(index?: number, nameOnly?: boolean): NamedTreeSchema | TreeSchemaIdentifier | undefined;

    /**
     * Gets the non-unwrapped node of this field by its index.
     */
    getWithoutUnwrapping(index: number): EditableTree;

    /**
     * Stores the target for the proxy which implements reading and writing for this sequence field.
     * The details of this object are implementation details,
     * but the presence of this symbol can be used to separate EditableTrees from other types.
     */
    readonly [proxyTargetSymbol]: object;

    /**
     * Gets an iterator iterating over the nodes (unwrapped) of this field.
     * See {@link UnwrappedEditableTree} for what does "unwrapped" mean.
     * It reads all nodes at once before the iteration starts to get a "snapshot" of this field.
     * It might be inefficient regarding resources, but avoids situations
     * when the field is getting changed while iterating over its nodes.
     */
    [Symbol.iterator](): IterableIterator<UnwrappedEditableTree>;
}

/**
 * Unwrapped field.
 * Non-sequence multiplicities are unwrapped to the child tree or `undefined` if there is none.
 * Sequence multiplicities are handled with {@link EditableField}.
 * See {@link UnwrappedEditableTree} for how the children themselves are unwrapped.
 */
export type UnwrappedEditableField = UnwrappedEditableTree | undefined | EditableField;

/**
 * This is a base class for `ProxyTarget` and `SequenceProxyTarget`, which uniformly handles cursors and anchors.
 */
export abstract class BaseProxyTarget {
    private readonly lazyCursor: ITreeSubscriptionCursor;
    private anchor?: Anchor;

    constructor(public readonly context: ProxyContext, cursor?: ITreeSubscriptionCursor) {
        if (cursor === undefined || cursor.state !== ITreeSubscriptionCursorState.Current) {
            // `neverAnchor` and `neverCursor` are used to indcate that and to not overlap with "alive" cursors and anchors.
            // Note that in this context `undefined` anchor is just a not yet created anchor.
            this.anchor = context.neverAnchor;
            this.lazyCursor = context.neverCursor;
        } else {
            this.lazyCursor = cursor.fork();
            context.withCursors.add(this);
        }
    }

    /**
     * Indicates that the target is empty.
     * This happens if a navigation with a cursor failed,
     * and the cursor either stays in a clear state or at the parent node.
     * Currently it is used in two cases:
     * - to get a length of an empty field, as the cursor cannot be used;
     * - to indicate that unwrapping should return `undefined` (just for a nicer code flow).
     */
    public get isEmptyTarget(): boolean {
        return this.anchor === this.context.neverAnchor;
    }

    public free(): void {
        if (this.isEmptyTarget) return;
        this.lazyCursor.free();
        this.context.withCursors.delete(this);
        if (this.anchor !== undefined) {
            this.context.forest.anchors.forget(this.anchor);
            this.context.withAnchors.delete(this);
            this.anchor = undefined;
        }
    }

    public getAnchor(): Anchor {
        if (this.anchor === undefined) {
            this.anchor = this.lazyCursor.buildAnchor();
            this.context.withAnchors.add(this);
        }
        return this.anchor;
    }

    public prepareForEdit(): void {
        this.getAnchor();
        this.lazyCursor.clear();
        this.context.withCursors.delete(this);
    }

    public get cursor(): ITreeSubscriptionCursor {
        if (this.lazyCursor.state === ITreeSubscriptionCursorState.Cleared) {
            assert(
                this.anchor !== undefined,
                0x3c3 /* EditableTree should have an anchor if it does not have a cursor */,
            );
            const result = this.context.forest.tryMoveCursorTo(this.anchor, this.lazyCursor);
            assert(
                result === TreeNavigationResult.Ok,
                0x3c4 /* It is invalid to access an EditableTree node which no longer exists */,
            );
            this.context.withCursors.add(this);
        }
        return this.lazyCursor;
    }
}

/**
 * A Proxy target, which together with a `handler` implements a basic access to
 * the fields of {@link EditableTree} by means of the cursors.
 */
export class ProxyTarget extends BaseProxyTarget {
    /**
     * If there is no cursor or it's not in a current state, this will become an empty target.
     */
    constructor(public readonly context: ProxyContext, cursor?: ITreeSubscriptionCursor) {
        super(context, cursor);
    }

    public getType(
        key?: FieldKey,
        nameOnly = true,
    ): NamedTreeSchema | TreeSchemaIdentifier | undefined {
        let typeName = this.cursor.type;
        if (key !== undefined) {
            const fieldKind = this.lookupFieldKind(key);
            if (fieldKind.multiplicity === Multiplicity.Sequence) {
                return undefined;
            }
            const fieldLength = this.cursor.childFieldLength(key);
            assert(fieldLength <= 1, 0x3c5 /* invalid non sequence */);
            typeName = mapCursorField(this.cursor, key, (c) => c.type)[0];
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
        return undefined;
    }

    get value(): Value {
        return this.cursor.value;
    }

    public lookupFieldKind(field: FieldKey): FieldKind {
        return getFieldKind(
            getFieldSchema(
                field,
                this.context.forest.schema,
                this.getType(undefined, false) as NamedTreeSchema,
            ),
        );
    }

    public getFieldKeys(): FieldKey[] {
        // For now this is an approximation:
        const fieldKeys: FieldKey[] = [];
        for (const key of this.cursor.keys) {
            // TODO: with new cursor API, field iteration will skip empty fields and this check can be removed.
            if (this.has(key)) {
                fieldKeys.push(key);
            }
        }
        return fieldKeys;
    }

    public has(field: FieldKey): boolean {
        // Make fields present only if non-empty.
        return this.cursor.childFieldLength(field) !== 0;
    }

    /**
     * @returns the key, if any, of the primary array field.
     */
    public getPrimaryArrayKey(): { key: LocalFieldKey; schema: FieldSchema } | undefined {
        const nodeType = this.getType(undefined, false) as NamedTreeSchema;
        const primary = getPrimaryField(nodeType);
        if (primary === undefined) {
            return undefined;
        }
        const kind = getFieldKind(primary.schema);
        if (kind.multiplicity === Multiplicity.Sequence) {
            // TODO: this could have issues if there are non-primary keys
            // that can collide with the array APIs (length or integers).
            return primary;
        }
        return undefined;
    }

    public proxifyField(field: FieldKey, unwrap = true): UnwrappedEditableField | EditableField {
        const fieldSchema = getFieldSchema(
            field,
            this.context.forest.schema,
            this.getType(undefined, false) as NamedTreeSchema,
        );
        const result = this.cursor.down(field, 0);
        if (result === TreeNavigationResult.Ok) {
            const target = new ProxyTarget(this.context, this.cursor);
            this.cursor.up();
            return proxifyField(fieldSchema, field, target, unwrap);
        }
        const emptyTarget = new ProxyTarget(this.context);
        return proxifyField(fieldSchema, field, emptyTarget, unwrap);
    }

    *[Symbol.iterator](): IterableIterator<EditableField> {
        const fields = this.getFieldKeys().map(
            (fieldKey) => this.proxifyField(fieldKey, false) as EditableField,
        );
        for (const field of fields) {
            yield field;
        }
    }
}

/**
 * A Proxy handler together with a {@link ProxyTarget} implements a basic read/write access to the Forest
 * by means of the cursors.
 */
const handler: AdaptingProxyHandler<ProxyTarget, EditableTree> = {
    get: (target: ProxyTarget, key: string | symbol): unknown => {
        if (typeof key === "string" || symbolIsFieldKey(key)) {
            // All string keys are fields
            return target.proxifyField(brand(key));
        }
        // utility symbols
        switch (key) {
            case getTypeSymbol:
                return target.getType.bind(target);
            case valueSymbol:
                return target.value;
            case proxyTargetSymbol:
                return target;
            case anchorSymbol:
                return target.getAnchor();
            case Symbol.iterator:
                return target[Symbol.iterator].bind(target);
            default:
                return undefined;
        }
    },
    set: (
        target: ProxyTarget,
        key: string | symbol,
        setValue: unknown,
        receiver: ProxyTarget,
    ): boolean => {
        throw new Error("Not implemented.");
    },
    deleteProperty: (target: ProxyTarget, key: string | symbol): boolean => {
        throw new Error("Not implemented.");
    },
    // Include documented symbols (except value when value is undefined) and all non-empty fields.
    has: (target: ProxyTarget, key: string | symbol): boolean => {
        if (typeof key === "string" || symbolIsFieldKey(key)) {
            return target.has(brand(key));
        }
        // utility symbols
        switch (key) {
            case proxyTargetSymbol:
            case getTypeSymbol:
            case anchorSymbol:
            case Symbol.iterator:
                return true;
            case valueSymbol:
                // Could do `target.value !== ValueSchema.Nothing`
                // instead if values which could be modified should report as existing.
                return target.value !== undefined;
            default:
                return false;
        }
    },
    // Includes all non-empty fields, which are the enumerable fields.
    ownKeys: (target: ProxyTarget): FieldKey[] => {
        return target.getFieldKeys();
    },
    getOwnPropertyDescriptor: (
        target: ProxyTarget,
        key: string | symbol,
    ): PropertyDescriptor | undefined => {
        // We generally don't want to allow users of the proxy to reconfigure all the properties,
        // but it is an TypeError to return non-configurable for properties that do not exist on target,
        // so they must return true.

        if ((typeof key === "string" || symbolIsFieldKey(key)) && target.has(brand(key))) {
            return {
                configurable: true,
                enumerable: true,
                value: target.proxifyField(brand(key)),
                writable: false,
            };
        }
        // utility symbols
        switch (key) {
            case proxyTargetSymbol:
                return { configurable: true, enumerable: false, value: target, writable: false };
            case getTypeSymbol:
                return {
                    configurable: true,
                    enumerable: false,
                    value: target.getType.bind(target),
                    writable: false,
                };
            case valueSymbol:
                return {
                    configurable: true,
                    enumerable: false,
                    value: target.value,
                    writable: false,
                };
            case anchorSymbol:
                return {
                    configurable: true,
                    enumerable: false,
                    value: target.getAnchor(),
                    writable: false,
                };
            case Symbol.iterator:
                return {
                    configurable: true,
                    enumerable: false,
                    value: target[Symbol.iterator].bind(target),
                    writable: false,
                };
            default:
                return undefined;
        }
    },
};

/**
 * A Proxy target, which together with a `sequenceProxyHandler` implements a basic access to
 * the nodes of {@link EditableField} by means of the cursors.
 */
class SequenceProxyTarget extends BaseProxyTarget implements ArrayLike<UnwrappedEditableTree> {
    private offset: number = 0;

    /**
     * @param context - the common context of EditableTrees.
     * @param cursor - the cursor must point either to the first node of the field or be undefined.
     * If there is no cursor or it's not in a current state, this will become an empty field.
     * @param fieldKey - the key of the field being proxified.
     * @param fieldSchema - the schema of the field being proxified.
     * @param primaryType - the `TreeSchemaIdentifier` of the parent node having this primary field (see 'getPrimaryField').
     *
     */
    constructor(
        context: ProxyContext,
        public readonly fieldKey: FieldKey,
        public readonly fieldSchema: FieldSchema,
        cursor?: ITreeSubscriptionCursor,
        private readonly primaryType?: TreeSchemaIdentifier,
    ) {
        super(context, cursor);
    }

    readonly [index: number]: UnwrappedEditableTree;

    public get length(): number {
        return this.isEmptyTarget ? 0 : this.cursor.currentFieldLength();
    }

    public getType(
        index?: number,
        nameOnly = true,
    ): TreeSchemaIdentifier | NamedTreeSchema | undefined {
        let typeName: TreeSchemaIdentifier | undefined;
        if (index === undefined) {
            // The field may be "typed" only if it's a primary field.
            if (this.primaryType !== undefined) {
                typeName = this.primaryType;
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
     * Returns a node (unwrapped by default, see {@link UnwrappedEditableTree}) by its index.
     * Make sure `keyIsValidIndex` is called before calling this,
     * as this method checks indices only implicitly while navigating with a cursor.
     */
    public proxifyNode(index: number, unwrap = true): UnwrappedEditableTree {
        const offset = index - this.offset;
        const result = this.cursor.seek(offset);
        assert(result === TreeNavigationResult.Ok, "Cannot navigate to the given index.");
        this.offset = index;
        return inProxyOrUnwrap(new ProxyTarget(this.context, this.cursor), unwrap);
    }

    /**
     * Gets a node by its index without unwrapping.
     */
    public getWithoutUnwrapping(index: number): EditableTree {
        return this.proxifyNode(index, false) as EditableTree;
    }

    /**
     * Gets array of unwrapped nodes.
     */
    private get asArray(): UnwrappedEditableTree[] {
        const array: UnwrappedEditableTree[] = [];
        for (let i = 0; i < this.length; i++) {
            array.push(this.proxifyNode(i));
        }
        return array;
    }

    *[Symbol.iterator](): IterableIterator<UnwrappedEditableTree> {
        for (const node of this.asArray) {
            yield node;
        }
    }
}

/**
 * Returns a Proxy handler, which together with a {@link SequenceProxyTarget} implements a basic read/write access to
 * the sequence fields by means of the cursors.
 */
const sequenceProxyHandler: AdaptingProxyHandler<SequenceProxyTarget, EditableField> = {
    get: (target: SequenceProxyTarget, key: string | symbol, receiver: object): unknown => {
        if (typeof key === "string") {
            if (key in { length: true, fieldKey: true, fieldSchema: true }) {
                return Reflect.get(target, key);
            } else if (keyIsValidIndex(key, target.length)) {
                return target.proxifyNode(Number(key));
            }
            const reflected = Reflect.get(target, key);
            if (typeof reflected === "function") {
                return function (...args: unknown[]): unknown {
                    return Reflect.apply(reflected, target, args);
                };
            }
            return undefined;
        }
        switch (key) {
            case proxyTargetSymbol:
                return target;
            case Symbol.iterator:
                return target[Symbol.iterator].bind(target);
            default:
        }
        return undefined;
    },
    set: (target: SequenceProxyTarget, key: string, value: unknown, receiver: unknown): boolean => {
        throw new Error("Not implemented");
    },
    deleteProperty: (target: SequenceProxyTarget, key: string): boolean => {
        throw new Error("Not supported");
    },
    // Include documented symbols and all non-empty fields.
    has: (target: SequenceProxyTarget, key: string | symbol): boolean => {
        if (typeof key === "symbol") {
            switch (key) {
                case Symbol.iterator:
                case proxyTargetSymbol:
                    return true;
                default:
            }
        } else {
            if (
                keyIsValidIndex(key, target.length) ||
                key in { length: true, fieldKey: true, fieldSchema: true }
            ) {
                return true;
            }
        }
        return false;
    },
    ownKeys: (target: SequenceProxyTarget): ArrayLike<keyof EditableField> => {
        // This includes 'length' property.
        const keys: string[] = getArrayOwnKeys(target.length);
        keys.push("fieldKey", "fieldSchema");
        return keys as ArrayLike<keyof EditableField>;
    },
    getOwnPropertyDescriptor: (
        target: SequenceProxyTarget,
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
                default:
            }
        } else {
            if (key in { length: true, fieldKey: true, fieldSchema: true }) {
                return {
                    configurable: true,
                    enumerable: false,
                    value: Reflect.get(target, key),
                    writable: false,
                };
            } else if (keyIsValidIndex(key, target.length)) {
                return {
                    configurable: true,
                    enumerable: true,
                    value: target.proxifyNode(Number(key)),
                    writable: false,
                };
            }
        }
        return undefined;
    },
};

/**
 * See {@link UnwrappedEditableTree} for documentation on what unwrapping this performs.
 */
function inProxyOrUnwrap(
    target: ProxyTarget | SequenceProxyTarget,
    unwrap: boolean,
    fieldKey?: FieldKey,
): UnwrappedEditableTree | EditableField {
    // Unwrap primitives or nodes having a primary field. Sequences unwrap nodes on their own.
    if (unwrap && !isSequenceProxyTarget(target)) {
        const nodeType = target.getType(undefined, false) as NamedTreeSchema;
        if (isPrimitive(nodeType)) {
            const nodeValue = target.cursor.value;
            if (isPrimitiveValue(nodeValue)) {
                return nodeValue;
            }
            assert(
                nodeType.value === ValueSchema.Serializable,
                0x3c7 /* `undefined` values not allowed for primitive fields */,
            );
        }
        const primary = target.getPrimaryArrayKey();
        if (primary !== undefined) {
            const result = target.cursor.down(primary.key, 0);
            const primarySequence = new SequenceProxyTarget(
                target.context,
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                fieldKey!,
                primary.schema,
                result === TreeNavigationResult.Ok ? target.cursor : undefined,
                nodeType.name,
            );
            return adaptWithProxy(primarySequence, sequenceProxyHandler);
        }
    }
    if (isSequenceProxyTarget(target)) {
        return adaptWithProxy(target, sequenceProxyHandler);
    }
    return adaptWithProxy(target, handler);
}

/**
 * @param fieldSchema - the FieldSchema of the field.
 * @param fieldKey - the key of the field. Used to visualize the tree.
 * @param childTargets - targets for the children of the field.
 * @param unwrap - if true, the children of the field are unwrapped (see {@link UnwrappedEditableField}),
 * otherwise returns the field as {@link EditableField}.
 */
export function proxifyField(
    fieldSchema: FieldSchema,
    fieldKey: FieldKey,
    target: ProxyTarget,
    unwrap: boolean,
): UnwrappedEditableField | EditableField {
    if (!unwrap) {
        const targetSequence = new SequenceProxyTarget(
            target.context,
            fieldKey,
            fieldSchema,
            target.cursor,
        );
        return inProxyOrUnwrap(targetSequence, unwrap) as EditableField;
    }
    const fieldKind = getFieldKind(fieldSchema);
    if (fieldKind.multiplicity === Multiplicity.Sequence) {
        const targetSequence = new SequenceProxyTarget(
            target.context,
            fieldKey,
            fieldSchema,
            target.cursor,
        );
        return inProxyOrUnwrap(targetSequence, unwrap);
    }
    return target.isEmptyTarget ? undefined : inProxyOrUnwrap(target, unwrap, fieldKey);
}

/**
 * A simple API for a Forest to interact with the tree.
 *
 * @returns {@link EditableTreeContext} which is used manage the cursors and anchors within the EditableTrees:
 * This is necessary for supporting using this tree across edits to the forest, and not leaking memory.
 */
export function getEditableTreeContext(forest: IEditableForest): EditableTreeContext {
    return new ProxyContext(forest);
}

/**
 * Checks the type of an UnwrappedEditableField.
 */
export function isUnwrappedNode(field: UnwrappedEditableField): field is EditableTree {
    return typeof field === "object" && !isEditableField(field);
}

/**
 * Checks the type of an UnwrappedEditableField.
 */
export function isEditableField(field: UnwrappedEditableField): field is EditableField {
    return (
        typeof field === "object" &&
        isSequenceProxyTarget(
            field[proxyTargetSymbol] as ProxyTarget | SequenceProxyTarget | undefined,
        )
    );
}

/**
 * Checks the type of a field's proxy target.
 */
export function isSequenceProxyTarget(
    target: ProxyTarget | SequenceProxyTarget | undefined,
): target is SequenceProxyTarget {
    return target !== undefined && !(target instanceof ProxyTarget);
}
