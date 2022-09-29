/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Value, Anchor, NeverAnchor, detachedFieldAsKey } from "../../tree";
import {
    TreeNavigationResult, mapCursorField, ITreeSubscriptionCursor, ITreeSubscriptionCursorState, ITreeCursor,
} from "../../forest";
import { brand } from "../../util";
import {
    FieldSchema, LocalFieldKey, TreeSchemaIdentifier, TreeSchema, ValueSchema, NamedTreeSchema,
} from "../../schema-stored";
import { FieldKind, Multiplicity } from "../modular-schema";
import { TypedJsonCursor } from "../../domains";
// import { RootedTextCursor } from "../treeTextCursorLegacy";
import {
    AdaptingProxyHandler,
    adaptWithProxy,
    getFieldKind, getFieldSchema, getPrimaryField, isPrimitive, isPrimitiveValue, PrimitiveValue,
} from "./utilities";
import { ProxyContext } from "./editableTreeContext";
import { ProxyTargetSequence, sequenceHandler, UnwrappedEditableSequence } from "./editableTreeSequence";

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

export const insertNodeSymbol: unique symbol = Symbol("editable-tree:insertNode()");

export const setValueSymbol: unique symbol = Symbol("editable-tree:setValue()");

export const deleteNodeSymbol: unique symbol = Symbol("editable-tree:deleteNode()");

export const insertRootSymbol: unique symbol = Symbol("editable-tree:insertRoot()");

/**
 * {@link EditableTree}, but without fields i.e. having only utility symbols.
 *
 */
export interface FieldlessEditableTree {
    /**
     * A function to get the type of a node.
     * If this node is well-formed, it must follow this schema.
     * @param key - if key is supplied, returns the type of a non-sequence child node (if exists)
     * @param nameOnly - if true, returns only the type identifier
     */
    readonly [getTypeSymbol]: (key?: string, nameOnly?: boolean) => TreeSchema | TreeSchemaIdentifier | undefined;

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
     * Creates a node
     */
    readonly [insertNodeSymbol]: (key: string, value: ITreeCursor) => boolean;

    readonly [setValueSymbol]: (key: string, value: unknown, typeName: TreeSchemaIdentifier) => boolean;

    readonly [deleteNodeSymbol]: (key: string) => boolean;
}

export interface EmptyEditableTree {
    readonly [insertRootSymbol]: (root: ITreeCursor) => UnwrappedEditableTree;
}

/**
 * A tree which can be traversed and edited.
 *
 * When iterating, only visits non-empty fields.
 * To discover empty fields, inspect the schema using {@link getTypeSymbol}.
 *
 * TODO: `extends Iterable<EditableField>`
 * TODO: provide non-schema impacted APIs for getting fields and nodes without unwrapping
 * (useful for generic code, and when references to these actual fields and nodes are required,
 * for example creating anchors and editing).
 */
export interface EditableTree extends FieldlessEditableTree {
    /**
     * Fields of this node, indexed by their field keys (as strings).
     *
     * This API exposes content in a way depending on the {@link Multiplicity} of the {@link FieldKind}.
     * Sequences (including empty ones) are always exposed as arrays,
     * and everything else is either a single EditableTree or undefined depending on if it's empty.
     *
     * TODO:
     * This approach to field lookup can result in collisions between global and local keys,
     * particularly with "extra" fields.
     * A mechanism for disambiguating this should be added,
     * likely involving an alternative mechanism for looking up global fields via symbols.
     */
    readonly [key: string]: UnwrappedEditableField;
}

/**
 * EditableTree,
 * but with any type that `isPrimitive` unwrapped into the value if that value is a {@link PrimitiveValue}.
 */
export type EditableTreeOrPrimitive = EditableTree | PrimitiveValue;

/**
 * EditableTree, but with these cases of unwrapping:
 * - primitives are unwrapped. See {@link EditableTreeOrPrimitive}.
 * - nodes with PrimaryField are unwrapped to just the primaryField. See `getPrimaryField`.
 * - fields are unwrapped based on their schema's multiplicity. See {@link UnwrappedEditableField}.
 *
 * TODO:
 * EditableTree should provide easy access to children in a way thats guaranteed
 * not to do this unwrapping for cases which need to refer to the actual nodes.
 * This may include cases like creating anchors and/or editing.
 */
export type UnwrappedEditableTree = EmptyEditableTree | EditableTreeOrPrimitive | UnwrappedEditableSequence;

/**
 * A field of an {@link EditableTree}.
 */
export type EditableField = readonly [FieldSchema, readonly EditableTree[]];

/**
 * Unwrapped field.
 * Non-sequence multiplicities are unwrapped to the child tree or `undefined` if there is none.
 * Sequence multiplicities are handled with {@link UnwrappedEditableSequence}.
 * See {@link UnwrappedEditableTree} for how the children themselves are unwrapped.
 */
export type UnwrappedEditableField = UnwrappedEditableTree | undefined | EmptyEditableTree | UnwrappedEditableSequence;

export class ProxyTarget {
    public readonly lazyCursor: ITreeSubscriptionCursor;
    private anchor?: Anchor;

    constructor(
        public readonly context: ProxyContext,
        cursor: ITreeSubscriptionCursor,
    ) {
        this.lazyCursor = cursor.fork();
        if (cursor.state === ITreeSubscriptionCursorState.Current) {
            this.context.withCursors.add(this);
        } else {
            this.lazyCursor.clear();
            this.anchor = NeverAnchor;
        }
    }

    public getAnchor(): Anchor {
        if (this.anchor === undefined) {
            this.anchor = this.lazyCursor.buildAnchor();
            this.context.withAnchors.add(this);
        }
        return this.anchor;
    }

    public setAnchor(anchor: Anchor) {
        if (this.anchor !== undefined) {
            assert(this.anchor === NeverAnchor, "Anchor cannot be changed");
        }
        this.anchor = anchor;
    }

    public free(): void {
        this.lazyCursor.free();
        this.context.withCursors.delete(this);
        if (this.anchor !== undefined) {
            this.context.forest.anchors.forget(this.anchor);
            this.context.withAnchors.delete(this);
            this.anchor = undefined;
        }
    }

    public prepareAnchorForEdit(): Anchor {
        const anchor = this.getAnchor();
        this.lazyCursor.clear();
        this.context.withCursors.delete(this);
        return anchor;
    }

    public get cursor(): ITreeSubscriptionCursor {
        if (this.lazyCursor.state === ITreeSubscriptionCursorState.Cleared) {
            assert(this.anchor !== undefined,
                0x3c3 /* EditableTree should have an anchor if it does not have a cursor */);
            const result = this.context.forest.tryMoveCursorTo(this.anchor, this.lazyCursor);
            assert(result === TreeNavigationResult.Ok,
                0x3c4 /* It is invalid to access an EditableTree node which no longer exists */);
            this.context.withCursors.add(this);
        }
        return this.lazyCursor;
    }

    public getType(key?: string, nameOnly?: boolean): TreeSchemaIdentifier | TreeSchema | undefined {
        let typeName = this.cursor.type;
        if (key !== undefined) {
            const childTypes = mapCursorField(this.cursor, brand(key), (c) => c.type);
            assert(childTypes.length <= 1, 0x3c5 /* invalid non sequence */);
            typeName = childTypes[0];
        }
        if (nameOnly) {
            return typeName;
        }
        if (typeName) {
            return this.context.forest.schema.lookupTreeSchema(typeName);
        }
        return undefined;
    }

    get value(): Value {
        return this.cursor.value;
    }

    public lookupFieldKind(key: string): FieldKind {
        return getFieldKind(getFieldSchema(this.getType() as TreeSchema, key));
    }

    public getKeys(): string[] {
        // For now this is an approximation:
        const keys: string[] = [];
        for (const key of this.cursor.keys) {
            // TODO: with new cursor API, field iteration will skip empty fields and this check can be removed.
            if (this.has(key as string)) {
                keys.push(key as string);
            }
        }
        return keys;
    }

    public has(key: string): boolean {
        // Make fields present only if non-empty.
        return this.cursor.length(brand(key)) !== 0;
    }

    /**
     * @returns the key, if any, of the primary array field.
     */
    public getPrimaryArrayKey(): LocalFieldKey | undefined {
        const nodeType = this.getType() as TreeSchema;
        const primary = getPrimaryField(nodeType);
        if (primary === undefined) {
            return undefined;
        }
        const kind = getFieldKind(primary.schema);
        if (kind.multiplicity === Multiplicity.Sequence) {
            // TODO: this could have issues if there are non-primary keys
            // that can collide with the array APIs (length or integers).
            return primary.key;
        }
        return undefined;
    }

    public proxifyField(key: string): UnwrappedEditableField {
        // Lookup the schema:
        const fieldKind = this.lookupFieldKind(key);
        // Make the childTargets:
        const childTargets = mapCursorField(this.cursor, brand(key), (c) => this.context.createTarget(c));
        return proxifyField(this.context, fieldKind, childTargets);
    }

    /**
     * Sets value of a non-sequence field.
     * This is correct only if sequence fields are unwrapped into arrays.
     */
    public setValue(key: string, _value: unknown, typeName: TreeSchemaIdentifier): boolean {
        const type = { name: typeName, ...this.context.forest.schema.lookupTreeSchema(typeName) };
        assert(isPrimitive(type), "Cannot set value of a non-primitive field");
        const target = mapCursorField(this.cursor, brand(key), (c) => this.context.createTarget(c))[0];
        const path = this.context.forest.anchors.locate(target.prepareAnchorForEdit());
        assert(path !== undefined, "Cannot locate a path to set a value");
        return this.context.setNodeValue(path, _value);
    }

    public insertNode(key: string, cursor: ITreeCursor): boolean {
        const fieldSchema = getFieldSchema(this.getType() as TreeSchema, key);
        const fieldKind = getFieldKind(fieldSchema);
        assert(fieldKind.multiplicity !== Multiplicity.Forbidden, "");
        // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
        assert(fieldSchema.types !== undefined && fieldSchema.types?.has(cursor.type), "Unknown type");
        const path = this.context.forest.anchors.locate(this.prepareAnchorForEdit());
        assert(path !== undefined, "Cannot locate a path to insert a node");
        return this.context.insertNode({
            parent: path,
            parentField: brand(key),
            parentIndex: 0,
        }, cursor);
    }

    public deleteNode(key: string): boolean {
        const path = this.context.forest.anchors.locate(this.prepareAnchorForEdit());
        assert(path !== undefined, "Can't locate a path to delete a node");
        return this.context.deleteNode({
            parent: path,
            parentField: brand(key),
            parentIndex: 0,
        }, 1);
    }

    public isEmpty(): boolean {
        return this.anchor === NeverAnchor;
    }

    public insertRoot(root: ITreeCursor, typeName: TreeSchemaIdentifier): EditableTree {
        const forest = this.context.forest;
        this.context.insertNode({
            parent: undefined,
            parentField: detachedFieldAsKey(forest.rootField),
            parentIndex: 0,
        }, root);
        const cursor = forest.allocateCursor();
        forest.tryMoveCursorTo(forest.root(forest.rootField), cursor);
        const editableTree = inProxyOrUnwrap(this.context, this.context.createTarget(cursor)) as EditableTree;
        cursor.free();
        return editableTree;
    }
}

/**
 * A Proxy handler together with a {@link ProxyTarget} implements a basic read/write access to the Forest
 * by means of the cursors.
 */
const handler: AdaptingProxyHandler<ProxyTarget, EditableTree> = {
    get: (target: ProxyTarget, key: string | symbol, receiver: unknown): unknown => {
        if (target.isEmpty()) {
            return key === insertRootSymbol ? target.insertRoot.bind(target) : undefined;
        }
        if (typeof key === "string") {
            // All string keys are fields
            return target.proxifyField(key);
        }
        switch (key) {
            case getTypeSymbol: {
                return target.getType.bind(target);
            }
            case valueSymbol: {
                return target.value;
            }
            case proxyTargetSymbol: {
                return target;
            }
            case insertNodeSymbol: {
                return target.insertNode.bind(target);
            }
            case setValueSymbol: {
                return target.setValue.bind(target);
            }
            case deleteNodeSymbol: {
                return target.deleteNode.bind(target);
            }
            default:
                return undefined;
        }
    },
    set: (target: ProxyTarget, key: string, value: unknown, receiver: unknown): boolean => {
        if (target.has(key)) {
            const typeName = target.getType(key, true) as TreeSchemaIdentifier;
            return target.setValue(key, value, typeName);
        }
        const fieldSchema = getFieldSchema(target.getType() as TreeSchema, key);
        assert(fieldSchema.types !== undefined && fieldSchema.types.size === 1,
            "Cannot resolve a field type, use 'insertNodeSymbol' instead");
        const name = [...fieldSchema.types][0];
        const type: NamedTreeSchema = { name, ...target.context.forest.schema.lookupTreeSchema(name) };
        const jsonValue = isPrimitiveValue(value) ? value : value as object;
        const schemaCursor = new TypedJsonCursor(target.context.forest.schema, type, jsonValue);
        return target.insertNode(key, schemaCursor as ITreeCursor);
    },
    deleteProperty: (target: ProxyTarget, key: string): boolean => {
        if (target.has(key)) {
            return target.deleteNode(key);
        }
        return false;
    },
    // Include documented symbols (except value when value is undefined) and all non-empty fields.
    has: (target: ProxyTarget, key: string | symbol): boolean => {
        if (typeof key === "symbol") {
            switch (key) {
                case proxyTargetSymbol:
                case getTypeSymbol:
                    return true;
                case valueSymbol:
                    // Could do `target.value !== ValueSchema.Nothing`
                    // instead if values which could be modified should report as existing.
                    return target.value !== undefined;
                case insertRootSymbol:
                    return target.isEmpty();
                case insertNodeSymbol:
                case deleteNodeSymbol:
                case setValueSymbol:
                    return !target.isEmpty();
                default:
                    return false;
            }
        }

        return target.has(key);
    },
    // Includes all non-empty fields, which are the enumerable fields.
    ownKeys: (target: ProxyTarget): string[] => {
        return target.getKeys();
    },
    getOwnPropertyDescriptor: (target: ProxyTarget, key: string | symbol): PropertyDescriptor | undefined => {
        // We generally don't want to allow users of the proxy to reconfigure all the properties,
        // but it is an TypeError to return non-configurable for properties that do not exist on target,
        // so they must return true.
        if (typeof key === "symbol") {
            switch (key) {
                case proxyTargetSymbol:
                    return { configurable: true, enumerable: false, value: target, writable: false };
                case getTypeSymbol:
                    return { configurable: true, enumerable: false, value: target.getType.bind(target), writable: false };
                case valueSymbol:
                    return { configurable: true, enumerable: false, value: target.value, writable: false };
                case insertRootSymbol:
                    return target.isEmpty()
                        ? { configurable: true, enumerable: false, value: target.insertRoot.bind(target), writable: false }
                        : undefined;
                case insertNodeSymbol:
                    return !target.isEmpty()
                        ? { configurable: true, enumerable: false, value: target.insertNode.bind(target), writable: false }
                        : undefined;
                case setValueSymbol:
                    return !target.isEmpty()
                        ? { configurable: true, enumerable: false, value: target.setValue.bind(target), writable: false }
                        : undefined;
                case deleteNodeSymbol:
                    return !target.isEmpty()
                        ? { configurable: true, enumerable: false, value: target.deleteNode.bind(target), writable: false }
                        : undefined;
                default:
                    return undefined;
            }
        } else {
            if (target.has(key)) {
                return {
                    configurable: true,
                    enumerable: true,
                    value: target.proxifyField(key),
                    writable: true,
                };
            }
        }
        return undefined;
    },
};

/**
 * See {@link UnwrappedEditableField} for documentation on what unwrapping this perform.
 */
export function inProxyOrUnwrap(context: ProxyContext, target: ProxyTarget | ProxyTargetSequence):
    UnwrappedEditableTree | UnwrappedEditableSequence {
    if (Array.isArray(target)) {
        return adaptWithProxy(target, sequenceHandler);
    } else if (!target.isEmpty()) {
        const fieldSchema = target.getType() as TreeSchema;
        if (fieldSchema !== undefined && isPrimitive(fieldSchema)) {
            const nodeValue = target.value;
            if (isPrimitiveValue(nodeValue)) {
                return nodeValue;
            }
            assert(fieldSchema.value === ValueSchema.Serializable,
                0x3c7 /* `undefined` values not allowed for primitive fields */);
        }
        const primaryKey = target.getPrimaryArrayKey();
        if (primaryKey !== undefined) {
            const sequenceTarget = new ProxyTargetSequence(context, [], target.cursor);
            mapCursorField(target.cursor, primaryKey, (c) => sequenceTarget.push(context.createTarget(c)));
            return adaptWithProxy(sequenceTarget, sequenceHandler);
        }
    }
    return adaptWithProxy(target, handler);
}

/**
 * @param fieldKind - determines how return value should be typed. See {@link UnwrappedEditableField}.
 * @param childTargets - targets for the children of the field.
 */
export function proxifyField(context: ProxyContext, fieldKind: FieldKind, childTargets: ProxyTarget[]):
    UnwrappedEditableField {
    if (fieldKind.multiplicity === Multiplicity.Sequence) {
        return inProxyOrUnwrap(context, new ProxyTargetSequence(context, childTargets));
    }
    // Avoid wrapping non-sequence fields in arrays
    assert(childTargets.length <= 1, 0x3c8 /* invalid non sequence */);
    return childTargets.length === 1 ? inProxyOrUnwrap(context, childTargets[0]) : undefined;
}

/**
 * Checks the type of an UnwrappedEditableField.
 */
export function isEditableFieldSequence(field: UnwrappedEditableField): field is UnwrappedEditableSequence {
    return Array.isArray(field);
}

/**
 * Checks the type of an UnwrappedEditableField.
 */
export function isUnwrappedNode(field: UnwrappedEditableField): field is EditableTree {
    return typeof field === "object" && !isEditableFieldSequence(field);
}

/**
 * Checks if the root node exists.
 */
export function isEmptyTree(field: UnwrappedEditableField): field is EmptyEditableTree {
    return isUnwrappedNode(field) && insertRootSymbol in field;
}
