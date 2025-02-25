/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";

import {
	type Brand,
	type Opaque,
	brand,
	extractFromOpaque,
	type _InlineTrick,
} from "../../util/index.js";
import type {
	FieldKey,
	TreeNodeSchemaIdentifier,
	ValueSchema,
} from "../schema-stored/index.js";

/**
 */
export type TreeType = TreeNodeSchemaIdentifier;

/**
 * The empty key ("") is used for unnamed relationships, such as the indexer
 * of an explicit array node.
 *
 * This key is a hint that this field is the primary function of the node,
 * and in some abstractions the APIs for this field should be inlined onto the node.
 *
 * TODO:
 * This has to be a FieldKey since different nodes will have different TreeFieldStoredSchema for it.
 * This makes it prone to collisions and suggests
 * that this intention may be better conveyed by metadata on the ITreeSchema.
 */
export const EmptyKey: FieldKey = brand("");

/**
 * FieldKey to use for the root of documents in places that need to refer to detached sequences or the root.
 * TODO: if we do want to standardize on a single value for this,
 * it likely should be namespaced or a UUID to avoid risk of collisions.
 */
export const rootFieldKey: FieldKey = brand("rootFieldKey");

/**
 */
export const rootField = keyAsDetachedField(rootFieldKey);

/**
 * Location of a tree relative to is parent container (which can be a tree or forest).
 */
export interface ChildLocation {
	readonly container: ChildCollection;
	readonly index: number;
}

/**
 * Wrapper around DetachedField that can be detected at runtime.
 */
export interface RootField {
	readonly key: DetachedField;
}

/**
 * Identifier for a child collection, either on a node/tree or at the root of a forest.
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
 * In some APIs DetachedFields are used as FieldKeys on a special implicit root node
 * to simplify the APIs and implementation.
 */
export interface DetachedField extends Opaque<Brand<string, "tree.DetachedField">> {}

/**
 * Some code abstracts the root as a node with detached fields as its fields.
 * This maps detached field to field keys for thus use.
 *
 * @returns `field` as a {@link FieldKey} usable on a special root node serving as a parent of detached fields.
 */
export function detachedFieldAsKey(field: DetachedField): FieldKey {
	return brand(extractFromOpaque(field));
}

/**
 * The inverse of {@link detachedFieldAsKey}.
 * Thus must only be used on {@link FieldKey}s which were produced via {@link detachedFieldAsKey},
 * and with the same scope (ex: forest) as the detachedFieldAsKey was originally from.
 */
export function keyAsDetachedField(key: FieldKey): DetachedField {
	return brand(key);
}

/**
 * TODO: integrate this into Schema. Decide how to persist them (need stable Id?). Maybe allow updating field kinds?.
 * TODO: make families of changes per field kind. Build editing APIs from that.
 * TODO: factor ChangeRebaser implementations to support adding new field kinds.
 */
export interface FieldKind {
	readonly name: string;
	readonly description: string;
	readonly minimumChildren: number;
	readonly maximumChildren: number;
}

/**
 * Value that may be stored on a leaf node.
 */
export type TreeValue<TSchema extends ValueSchema = ValueSchema> = [
	{
		[ValueSchema.Number]: number;
		[ValueSchema.String]: string;
		[ValueSchema.Boolean]: boolean;
		[ValueSchema.FluidHandle]: IFluidHandle;
		// eslint-disable-next-line @rushstack/no-new-null
		[ValueSchema.Null]: null;
	}[TSchema],
][_InlineTrick];

/**
 * Value stored on a node.
 */
export type Value = undefined | TreeValue;

/**
 * The fields required by a node in a tree.
 *
 * @privateRemarks A forked version of this type is used in `persistedTreeTextFormat.ts`.
 * Changes to this type might necessitate changes to `EncodedNodeData` or codecs.
 * See persistedTreeTextFormat's module documentation for more details.
 */
export interface NodeData {
	/**
	 * A payload of arbitrary serializable data.
	 */
	readonly value?: TreeValue;

	/**
	 * The meaning of this node.
	 * Provides contexts/semantics for this node and its content.
	 * Typically used to associate a node with metadata (including a schema) and source code (types, behaviors, etc).
	 */
	readonly type: TreeNodeSchemaIdentifier;
}

/**
 * Use this type to indicate that a node sits above the detached fields, and thus is not a real node and who's type should not matter.
 */
export const aboveRootPlaceholder: TreeNodeSchemaIdentifier = brand(
	"com.fluidframework.placeholder.aboveRoot",
);
