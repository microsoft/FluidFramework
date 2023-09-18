/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable } from "@fluidframework/datastore-definitions";
import { FieldKey, TreeSchemaIdentifier } from "../schema-stored";
import { brand, Brand, extractFromOpaque, Opaque } from "../../util";

/**
 * @public
 */
export type TreeType = TreeSchemaIdentifier;

/**
 * The empty key ("") is used for unnamed relationships, such as the indexer
 * of an explicit array node.
 *
 * This key is a hint that this field is the primary function of the node,
 * and in some abstractions the APIs for this field should be inlined onto the node.
 *
 * TODO:
 * This has to be a FieldKey since different nodes will have different FieldStoredSchema for it.
 * This makes it prone to collisions and suggests
 * that this intention may be better conveyed by metadata on the ITreeSchema.
 * @public
 */
export const EmptyKey: FieldKey = brand("");

/**
 * FieldKey to use for the root of documents in places that need to refer to detached sequences or the root.
 * TODO: if we do want to standardize on a single value for this,
 * it likely should be namespaced or a UUID to avoid risk of collisions.
 * @public
 */
export const rootFieldKey: FieldKey = brand("rootFieldKey");

/**
 * @public
 */
export const rootField = keyAsDetachedField(rootFieldKey);

/**
 * Location of a tree relative to is parent container (which can be a tree or forest).
 *
 * @public
 */
export interface ChildLocation {
	readonly container: ChildCollection;
	readonly index: number;
}

/**
 * Wrapper around DetachedField that can be detected at runtime.
 * @public
 */
export interface RootField {
	readonly key: DetachedField;
}

/**
 * Identifier for a child collection, either on a node/tree or at the root of a forest.
 * @public
 */
export type ChildCollection = FieldKey | RootField;

// TODO: its not clear how much DetachedField belongs here in tree,
// but for now as its needed in Rebase and Forest,
// it makes sense to have it here for reasoning about the roots of trees.
/**
 * A root in the forest.
 *
 * The range is a "container" like a field:
 * any additional content inserted before or after contents of this range will be included in the range.
 * This also means that moving the content from this range elsewhere will leave this range valid, but empty.
 *
 * DetachedFields are not valid to use as across edits:
 * they are only valid within the edit in which they were created.
 *
 * In some APIs DetachedFields are used as FieldKeys on a special implicit root node
 * to simplify the APIs and implementation.
 * @public
 */
export interface DetachedField extends Opaque<Brand<string, "tree.DetachedField">> {}

/**
 * Some code abstracts the root as a node with detached fields as its fields.
 * This maps detached field to field keys for thus use.
 *
 * @returns `field` as a {@link FieldKey} usable on a special root node serving as a parent of detached fields.
 * @public
 */
export function detachedFieldAsKey(field: DetachedField): FieldKey {
	return brand(extractFromOpaque(field));
}

/**
 * The inverse of {@link detachedFieldAsKey}.
 * Thus must only be used on {@link FieldKey}s which were produced via {@link detachedFieldAsKey},
 * and with the same scope (ex: forest) as the detachedFieldAsKey was originally from.
 * @public
 */
export function keyAsDetachedField(key: FieldKey): DetachedField {
	return brand(key);
}

/**
 * TODO: integrate this into Schema. Decide how to persist them (need stable Id?). Maybe allow updating field kinds?.
 * TODO: make families of changes per field kind. Build editing APIs from that.
 * TODO: factor ChangeRebaser implementations to support adding new field kinds.
 * @public
 */
export interface FieldKind {
	readonly name: string;
	readonly description: string;
	readonly minimumChildren: number;
	readonly maximumChildren: number;
}

/**
 * Value that may be stored on a node.
 *
 * TODO: `Serializable` is not really the right type to use here,
 * since many types (including functions) are "Serializable" (according to the type) despite not being serializable.
 *
 * Use this type instead of directly using Serializable for both clarity and so the above TODO can be addressed.
 *
 * This is a named interface instead of a Type alias so tooling (ex: refactors) will not replace it with `any`.
 * @public
 */
export interface TreeValue extends Serializable {}

/**
 * Value stored on a node.
 * @public
 */
export type Value = undefined | TreeValue;

/**
 * The fields required by a node in a tree.
 *
 * @privateRemarks A forked version of this type is used in `persistedTreeTextFormat.ts`.
 * Changes to this type might necessitate changes to `EncodedNodeData` or codecs.
 * See persistedTreeTextFormat's module documentation for more details.
 *
 * @public
 */
export interface NodeData {
	/**
	 * A payload of arbitrary serializable data.
	 *
	 * TODO: clarify rules for mutating this value.
	 * For now, avoid mutating the TreeValue itself.
	 * For example, if its an object, make a modified copy of the object instead of mutating it.
	 */
	value?: TreeValue;

	/**
	 * The meaning of this node.
	 * Provides contexts/semantics for this node and its content.
	 * Typically used to associate a node with metadata (including a schema) and source code (types, behaviors, etc).
	 */
	readonly type: TreeSchemaIdentifier;
}
