/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Value,
	FieldKey,
	FieldSchema,
	TreeSchemaIdentifier,
	TreeSchema,
	ForestEvents,
	SchemaDataAndPolicy,
} from "../core";
import { ISubscribable } from "../events";
import { requireAssignableTo } from "../util";
import { PrimitiveValue, MarkedArrayLike, typeNameSymbol, valueSymbol } from "./contextuallyTyped";
import {
	EditableField,
	EditableTree,
	EditableTreeEvents,
	contextSymbol,
	getField,
	on,
	parentField,
	typeSymbol,
} from "./editable-tree";

/**
 * This file provides an API for working with trees which is type safe even when schema is not known.
 * This means no editing is allowed.
 *
 * Schema aware APIs for working with trees should superset this, while sub-setting EditableTree.
 *
 * TODO:
 * This API should replace EditableTree as the default public API for tree access.
 * SchemaAware builds on this, adding editing and type safe APIs which can be accessed via SchematizeView.
 * Once this is finished, the unsafe EditableTree types can be removed (or converted to package internal documentation for the proxies).
 */

/**
 * A tree of an unknown type.
 * This only includes operations that are safe to do without knowing the schema for the tree, so it does not include any editing.
 *
 * TODO: document how to downcast to more specific types for schema aware reading and editing APIs.
 *
 * @alpha
 */
export interface UntypedTree extends UntypedTreeCore {
	/**
	 * The name of the node type.
	 */
	readonly [typeNameSymbol]: TreeSchemaIdentifier;

	/**
	 * Value stored on this node.
	 */
	readonly [valueSymbol]: Value;

	/**
	 * Fields of this node, indexed by their field keys.
	 *
	 * This API exposes content in a way depending on the {@link Multiplicity} of the {@link FieldKind}.
	 * Sequences (including empty ones) are always exposed as {@link UntypedField}s,
	 * and everything else is either a single UntypedTree or undefined depending on if it's empty.
	 */
	readonly [key: FieldKey]: UnwrappedUntypedField;
}

/**
 * Subset of {@link UntypedTree} which does not get narrowed based on schema.
 *
 * TODO:
 * getField should be made schema aware and moved to `UntypedTree`.
 * @alpha
 */
export interface UntypedTreeCore extends Iterable<UntypedField> {
	/**
	 * The type of the node.
	 * If this node is well-formed, it must follow this schema.
	 */
	readonly [typeSymbol]: TreeSchema;

	/**
	 * A common context of a "forest" of EditableTrees.
	 */
	readonly [contextSymbol]: UntypedTreeContext;

	/**
	 * Gets the field of this node by its key without unwrapping.
	 */
	[getField](fieldKey: FieldKey): UntypedField;

	/**
	 * The field this tree is in, and the index within that field.
	 */
	readonly [parentField]: { readonly parent: UntypedField; readonly index: number };

	/**
	 * {@inheritDoc ISubscribable#on}
	 */
	[on]<K extends keyof EditableTreeEvents>(
		eventName: K,
		listener: EditableTreeEvents[K],
	): () => void;
}

/**
 * UntypedTree,
 * but with any type that `isPrimitive` unwrapped into the value if that value is a {@link PrimitiveValue}.
 * @alpha
 */
export type UntypedTreeOrPrimitive = UntypedTree | PrimitiveValue;

/**
 * UntypedTree, but with these cases of unwrapping:
 * - primitives are unwrapped. See {@link UntypedTreeOrPrimitive}.
 * - nodes with PrimaryField (see `getPrimaryField`) are unwrapped to {@link UntypedField}s.
 * - fields are unwrapped based on their schema's multiplicity. See {@link UnwrappedUntypedField}.
 * @alpha
 */
export type UnwrappedUntypedTree = UntypedTreeOrPrimitive | UntypedField;

/**
 * Unwrapped field.
 * Non-sequence multiplicities are unwrapped to the child tree or `undefined` if there is none.
 * Sequence multiplicities are handled with {@link UntypedField}.
 * See {@link UnwrappedUntypedTree} for how the children themselves are unwrapped.
 * @alpha
 */
export type UnwrappedUntypedField = UnwrappedUntypedTree | undefined | UntypedField;

/**
 * A field of an {@link UntypedTree} as an array-like sequence of unwrapped nodes (see {@link UnwrappedUntypedTree}).
 * @alpha
 */
export interface UntypedField extends MarkedArrayLike<UnwrappedUntypedTree> {
	/**
	 * The `FieldSchema` of this field.
	 */
	readonly fieldSchema: FieldSchema;

	/**
	 * The `FieldKey` of this field.
	 */
	readonly fieldKey: FieldKey;

	/**
	 * The node which has this field on it under `fieldKey`.
	 * `undefined` iff this field is a detached field.
	 */
	readonly parent?: UntypedTree;

	/**
	 * A common context of a "forest" of EditableTrees.
	 */
	readonly context: UntypedTreeContext;

	/**
	 * Gets a node of this field by its index without unwrapping.
	 * Note that the node must exists at the given index.
	 */
	getNode(index: number): UntypedTree;
}

/**
 * A common context of a "forest" of UntypedTrees.
 * @alpha
 */
export interface UntypedTreeContext extends ISubscribable<ForestEvents> {
	/**
	 * Gets the root field of the tree.
	 */
	readonly root: UntypedField;

	/**
	 * Gets the root field of the tree.
	 *
	 * See {@link UnwrappedEditableField} for what is unwrapped.
	 */
	readonly unwrappedRoot: UnwrappedUntypedField;

	/**
	 * Schema used within this context.
	 * All data must conform to these schema.
	 *
	 * The root's schema is tracked under {@link rootFieldKey}.
	 */
	readonly schema: SchemaDataAndPolicy;

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
	 * It is invalid to use the context after this.
	 */
	free(): void;

	/**
	 * Release any cursors and anchors held by EditableTrees created in this context.
	 * The EditableTrees are invalid to use after this, but the context may still be used
	 * to create new trees starting from the root.
	 */
	clear(): void;
}

{
	type _check1 = requireAssignableTo<EditableTree, UntypedTree>;
	type _check2 = requireAssignableTo<EditableField, UntypedField>;
}
