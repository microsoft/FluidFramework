/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/common-utils";
import { Value, Anchor } from "../../tree";
import {
	IEditableForest, TreeNavigationResult, mapCursorField, ITreeSubscriptionCursor, ITreeSubscriptionCursorState,
} from "../../forest";
import { brand } from "../../util";
import { TreeSchema, FieldSchema, rootFieldKey, LocalFieldKey } from "../../schema-stored";
import { FieldKind, Multiplicity } from "../modular-schema";
import {
    AdaptingProxyHandler,
    adaptWithProxy,
    getFieldKind, getFieldSchema, getPrimaryField, isPrimitive, isPrimitiveValue, PrimitiveValue,
} from "./utilities";

// Symbol for extracting target from editable-tree proxies.
// Useful for debugging and testing, but not part of the public API.
export const proxySymbol: unique symbol = Symbol("editable-tree proxy");

/**
 * A symbol to for the type of a node in contexts where string keys are already in use for fields.
 */
export const type: unique symbol = Symbol("editable-tree type");

 /**
 * A symbol to for the value of a node in contexts where string keys are already in use for fields.
 */
export const value: unique symbol = Symbol("editable-tree value");

/**
 * A tree which can be traversed and edited.
 *
 * When iterating, only visits non tempt fields.
 * To discover empty fields, inspect the schema using {@link typeSymbol}.
 *
 * TODO: support editing.
 * TODO: `extends Iterable<EditableField>`
 * TODO: use proxies for array fields not just raw arrays (will be needed for laziness and editing).
 * TODO: provide non-schema impacted APIs for getting fields and nodes without unwrapping
 * (useful for generic code, and when references to these actual fields and nodes are required,
 * for example creating anchors and editing).
 */
export interface EditableTree {
    /**
     * The type of this node.
     * If this node is is well-formed, it must follow this schema.
     */
    readonly [type]: TreeSchema;

    /**
     * Value stored on this node.
     */
    readonly [value]: Value;

    readonly [proxySymbol]: object;

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
 * but with for a type that `isPrimitive` unwrapped into just the value if that value is a {@link PrimitiveValue}.
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
export type UnwrappedEditableTree = EditableTreeOrPrimitive | readonly UnwrappedEditableTree[];

/**
 * A field of an {@link EditableTree}.
 */
export type EditableField = readonly [FieldSchema, readonly EditableTree[]];

/**
 * Unwraps fields with non-sequence multiplicities.
 */
export type UnwrappedEditableField = UnwrappedEditableTree | undefined | readonly UnwrappedEditableTree[];

export interface EditableTreeContext {
    /**
     * Call before editing.
     *
     * Note that after performing edits, EditableTrees for nodes that no longer exist are invalid to use.
     * TODO: maybe add an API to check if a specific EditableTree still exists,
     * and only make use other than that invalid.
     */
    prepareForEdit(): void;

    /**
     * Call to free resources.
     * EditableTrees created in this context are invalid to use after this.
     */
    free(): void;
}

class ProxyContext implements EditableTreeContext {
    public readonly withCursors: Set<ProxyTarget> = new Set();
    public readonly withAnchors: Set<ProxyTarget> = new Set();
    constructor(public readonly forest: IEditableForest) {}

    public prepareForEdit(): void {
        for (const target of this.withCursors) {
            target.prepareForEdit();
        }
        assert(this.withCursors.size === 0, "prepareForEdit should remove all cursors");
    }
    public free(): void {
        for (const target of this.withCursors) {
            target.free();
        }
        for (const target of this.withAnchors) {
            target.free();
        }
        assert(this.withCursors.size === 0, "free should remove all cursors");
        assert(this.withAnchors.size === 0, "free should remove all anchors");
    }
}

class ProxyTarget {
	private readonly lazyCursor: ITreeSubscriptionCursor;
    private anchor?: Anchor;

	constructor(
		public readonly context: ProxyContext,
		cursor: ITreeSubscriptionCursor,
	) {
		this.lazyCursor = cursor.fork();
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

    public prepareForEdit(): void {
        if (this.anchor === undefined) {
            this.anchor = this.lazyCursor.buildAnchor();
            this.context.withAnchors.add(this);
        }
        this.lazyCursor.free();
        this.context.withCursors.delete(this);
    }

	public get cursor(): ITreeSubscriptionCursor {
		if (this.lazyCursor.state === ITreeSubscriptionCursorState.Cleared) {
            assert(this.anchor !== undefined, "EditableTree should have anchor it it does not have a cursor");
			const result = this.context.forest.tryMoveCursorTo(this.anchor, this.lazyCursor);
			assert(result === TreeNavigationResult.Ok,
                "It is invalid to access an EditableTree node which no longer exists");
		}
		return this.lazyCursor;
	}

	get type(): TreeSchema {
		return this.context.forest.schema.lookupTreeSchema(this.cursor.type);
	}

    get value(): Value {
		return this.cursor.value;
	}

    public lookupFieldKind(key: string): FieldKind {
        return getFieldKind(getFieldSchema(this.type, key));
    }

	getKeys(): string[] {
		return [...this.cursor.keys] as string[];
	}

    /**
     * @returns the key, if any, of the primary array field.
     */
    public getPrimaryArrayKey(): LocalFieldKey | undefined {
        const nodeType = this.type;
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
        const childTargets = mapCursorField(this.cursor, brand(key), (c) => new ProxyTarget(this.context, c));
        return proxifyField(fieldKind, childTargets);
    }
}

/**
 * A Proxy handler together with a {@link ProxyTarget} implements a basic read/write access to the Forest
 * by means of the cursors.
 */
const handler: AdaptingProxyHandler<ProxyTarget, EditableTree> = {
	get: (target: ProxyTarget, key: string | symbol): unknown => {
		if (typeof key === "string") {
            // All string keys are fields
            return target.proxifyField(key);
        }
		if (key === type) {
			return target.type;
		} else if (key === value) {
            return target.value;
        } else if (key === proxySymbol) {
            return target;
        }
		return undefined;
	},
	set: (target: ProxyTarget, key: string | symbol, setValue: unknown, receiver: ProxyTarget): boolean => {
		throw new Error("Not implemented.");
	},
	deleteProperty: (target: ProxyTarget, key: string | symbol): boolean => {
		throw new Error("Not implemented.");
	},
    // Include documented symbols (except value when value is undefined) and all non-empty fields.
	has: (target: ProxyTarget, key: string | symbol): boolean => {
        if (typeof key === "symbol") {
			switch (key) {
				case proxySymbol:
				case type:
				// Currently not supporting iteration over fields.
                // case Symbol.iterator:
					return true;
                case value:
                    // Could do `target.value !== ValueSchema.Nothing`
                    // instead if values which could be modified should report as existing.
                    return target.value !== undefined;
				default:
					return false;
			}
		}

        // For now primary array fields are handled by just returning the array, so we don't need this:
        // const length = target.getPrimaryArrayLength();
        // if (length !== undefined) {
        //     // Act like an array.
        //     // This means that "0" can be present, but not "0.0", "0.1", "-0", " 0" etc.
        //     // Simplest way to check for this is to round trip:
        //     if (key in []) {
        //         return true;
        //     }
        //     const numeric = Number(key);
        //     if (String(Number(key)) === key && Number.isInteger(numeric) && numeric >= 0 && numeric < length) {
        //         return true;
        //     }
        // }

        // Make fields present only if non-empty.
		return target.cursor.length(brand(key)) !== 0;
	},
    // Includes all non-empty fields, which are the enumerable fields.
	ownKeys: (target: ProxyTarget): string[] => {
        // For now this is an approximation:
        const keys: string[] = [];
        for (const key of target.cursor.keys) {
            // TODO: with new cursor API, field iteration will skip empty fields and this check can be removed.
            if (target.cursor.length(key) !== 0) {
                keys.push(key as string);
            }
        }
        return keys;
	},
	getOwnPropertyDescriptor: (target: ProxyTarget, key: string | symbol): PropertyDescriptor | undefined => {
		// We generally don't want to allow users of the proxy to reconfigure all the properties,
        // but it is an TypeError to return non-configurable for properties that do not exist on target,
        // so they must return true.

        if (typeof key === "symbol") {
			if (key === proxySymbol) {
				return { configurable: true, enumerable: false, value: target, writable: false };
			} else if (key === type) {
				return { configurable: true, enumerable: false, value: target.type, writable: false };
			}
		} else {
			const length = target.cursor.length(brand(key));
			if (length !== 0) {
				return {
					configurable: true,
					enumerable: true,
					value: target.proxifyField(key),
					writable: false,
				};
			}
		}
		return undefined;
	},
};

/**
 * See {@link UnwrappedEditableTree} for documentation on what unwrapping this perform.
 */
function inProxyOrUnwrap(target: ProxyTarget): UnwrappedEditableTree {
    if (isPrimitive(target.type)) {
        const nodeValue = target.cursor.value;
        if (isPrimitiveValue(nodeValue)) {
            return nodeValue;
        }
    }
    const primary = target.getPrimaryArrayKey();
    if (primary !== undefined) {
        const childTargets = mapCursorField(target.cursor, primary, (c) => new ProxyTarget(target.context, c));
        return childTargets.map(inProxyOrUnwrap);
    }
    return adaptWithProxy(target, handler);
}

/**
 * @param fieldKind - determines how return value should be typed. See {@link UnwrappedEditableField}.
 * @param childTargets - targets for the children of the field.
 */
function proxifyField(fieldKind: FieldKind, childTargets: ProxyTarget[]): UnwrappedEditableField {
    if (fieldKind.multiplicity === Multiplicity.Sequence) {
        // Return array for sequence fields
        return childTargets.map(inProxyOrUnwrap);
    } else {
        // Avoid wrapping non-sequence fields in arrays
        assert(childTargets.length <= 1, "invalid non sequence");
        if (childTargets.length === 1) {
            return inProxyOrUnwrap(childTargets[0]);
        } else {
            return undefined;
        }
    }
}

/**
 * A simple API for a Forest to showcase basic interaction scenarios.
 *
 * This function returns an instance of a JS Proxy typed as an EditableTree.
 * Use built-in JS functions to get more information about the data stored e.g.
 * ```
 * const [context, data] = getEditableTree(forest);
 * for (const key of Object.keys(data)) { ... }
 * // OR
 * if ("foo" in data) { ... }
 * context.free();
 * ```
 *
 * Not (yet) supported: create properties, set values and delete properties.
 *
 * @returns {@link EditableTree} for the given {@link IEditableForest}.
 * Also returns an {@link EditableTreeContext} which is used manage the cursors and anchors within the EditableTrees:
 * This is necessary for supporting using this tree across edits to the forest, and not leaking memory.
 */
export function getEditableTree(forest: IEditableForest): [EditableTreeContext, UnwrappedEditableField] {
	const context = new ProxyContext(forest);
    const cursor = forest.allocateCursor();
    const destination = forest.root(forest.rootField);
    const cursorResult = forest.tryMoveCursorTo(destination, cursor);
    const targets: ProxyTarget[] = [];
    if (cursorResult === TreeNavigationResult.Ok) {
        do {
            targets.push(new ProxyTarget(context, cursor));
        } while (cursor.seek(1) === TreeNavigationResult.Ok);
    }
    cursor.free();
    forest.anchors.forget(destination);
    const rootSchema = forest.schema.lookupGlobalFieldSchema(rootFieldKey);
    return [context, proxifyField(getFieldKind(rootSchema), targets)];
}
