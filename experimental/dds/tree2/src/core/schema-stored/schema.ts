/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Brand, brand, brandedStringType } from "../../util";

/**
 * Identifier for a TreeNode schema.
 * Also known as "Definition"
 *
 * Stable identifier, used when persisting data.
 * @alpha
 */
export type TreeNodeSchemaIdentifier<TName extends string = string> = Brand<
	TName,
	"tree.TreeNodeSchemaIdentifier"
>;

/**
 * TypeBox Schema for encoding {@link TreeNodeSchemaIdentifiers} in persisted data.
 */
export const TreeNodeSchemaIdentifierSchema = brandedStringType<TreeNodeSchemaIdentifier>();

/**
 * Key (aka Name or Label) for a field which is scoped to a specific TreeNodeStoredSchema.
 *
 * Stable identifier, used when persisting data.
 * @alpha
 */
export type FieldKey = Brand<string, "tree.FieldKey">;

/**
 * TypeBox Schema for encoding {@link FieldKey} in persisted data.
 */
export const FieldKeySchema = brandedStringType<FieldKey>();

/**
 * Identifier for a FieldKind.
 * Refers to an exact stable policy (ex: specific version of a policy),
 * for how to handle (ex: edit and merge edits to) fields marked with this kind.
 * Persisted in documents as part of stored schema.
 * @alpha
 */
export type FieldKindIdentifier = Brand<string, "tree.FieldKindIdentifier">;
export const FieldKindIdentifierSchema = brandedStringType<FieldKindIdentifier>();

/**
 * Schema for what {@link TreeValue} is allowed on a Leaf node.
 * @alpha
 */
export enum ValueSchema {
	Number,
	String,
	Boolean,
	FluidHandle,
	Null,
}

/**
 * Set of allowed tree types.
 * Providing multiple values here allows polymorphism, tagged union style.
 *
 * If not specified, types are unconstrained
 * (equivalent to the set containing every TreeNodeSchemaIdentifier defined in the document).
 *
 * Note that even when unconstrained, children must still be in-schema for their own type.
 *
 * In the future, this could be extended to allow inlining a TreeNodeStoredSchema here
 * (or some similar structural schema system).
 * For structural types which could go here, there are a few interesting options:
 *
 * - Allow replacing the whole set with a structural type for terminal / non-tree data,
 * and use this as a replacement for values on the tree nodes.
 *
 * - Allow expression structural constraints for child trees, for example requiring specific traits
 * (ex: via TreeNodeStoredSchema), instead of by type.
 *
 * There are two ways this could work:
 *
 * - Constrain the child nodes based on their shape:
 * this makes schema safe editing difficult because nodes would incur extra editing constraints to prevent them
 * from going out of schema based on their location in such a field.
 *
 * - Constrain the types allowed based on which types guarantee their data will always meet the constraints.
 *
 * Care would need to be taken to make sure this is sound for the schema updating mechanisms.
 * @alpha
 */
export type TreeTypeSet = ReadonlySet<TreeNodeSchemaIdentifier> | undefined;

/**
 * Specifies which field kind to use.
 *
 * @remarks
 * This is used instead of just the FieldKindIdentifier so that it can be subtyped into a more expressive type with additional information.
 *
 * @alpha
 */
export interface FieldKindSpecifier<T = FieldKindIdentifier> {
	identifier: T;
}

/**
 * @alpha
 */
export interface TreeFieldStoredSchema {
	readonly kind: FieldKindSpecifier;
	/**
	 * The set of allowed child types.
	 * If not specified, types are unconstrained.
	 */
	readonly types?: TreeTypeSet;
}

/**
 * Identifier used for the FieldKind for fields which must be empty.
 *
 * @remarks
 * This mainly show up in:
 * 1. The root default field for documents.
 * 2. The schema used for out of schema fields (which thus must be empty/not exist) on object and leaf nodes.
 *
 * @alpha
 */
export const forbiddenFieldKindIdentifier = "Forbidden";

/**
 * A schema for empty fields (fields which must always be empty).
 * There are multiple ways this could be encoded, but this is the most explicit.
 */
export const storedEmptyFieldSchema: TreeFieldStoredSchema = {
	// This kind requires the field to be empty.
	kind: { identifier: brand(forbiddenFieldKindIdentifier) },
	// This type set also forces the field to be empty not not allowing any types as all.
	types: new Set(),
};

/**
 * @alpha
 */
export interface TreeNodeStoredSchema {
	/**
	 * Schema for fields with keys scoped to this TreeNodeStoredSchema.
	 *
	 * This refers to the TreeFieldStoredSchema directly
	 * (as opposed to just supporting FieldSchemaIdentifier and having a central FieldKey -\> TreeFieldStoredSchema map).
	 * This allows os short friendly field keys which can ergonomically used as field names in code.
	 * It also interoperates well with mapFields being used as a map with arbitrary data as keys.
	 */
	readonly objectNodeFields: ReadonlyMap<FieldKey, TreeFieldStoredSchema>;

	/**
	 * Constraint for fields not mentioned in `objectNodeFields`.
	 * If undefined, all such fields must be empty.
	 *
	 * Allows using using the fields as a map, with the keys being
	 * FieldKeys and the values being constrained by this TreeFieldStoredSchema.
	 *
	 * Usually `FieldKind.Value` should NOT be used here
	 * since no nodes can ever be in schema are in schema if you use `FieldKind.Value` here
	 * (that would require infinite children).
	 */
	readonly mapFields?: TreeFieldStoredSchema;

	/**
	 * There are several approaches for how to store actual data in the tree
	 * (special node types, special field contents, data on nodes etc.)
	 * as well as several options about how the data should be modeled at this level
	 * (byte sequence? javascript type? json?),
	 * as well as options for how much of this would be exposed in the schema language
	 * (ex: would all nodes with values be special built-ins, or could any schema add them?)
	 *
	 * A simple easy to do in javascript approach is taken here:
	 * this is not intended to be a suggestion of what approach to take, or what to expose in the schema language.
	 * This is simply one approach that can work for modeling them in the internal schema representation.
	 */
	readonly leafValue?: ValueSchema;
}

/**
 * Document schema data that can be stored in a document.
 *
 * @remarks
 * Note: the owner of this may modify it over time:
 * thus if needing to hand onto a specific version, make a copy.
 * @alpha
 */
export interface TreeStoredSchema extends StoredSchemaCollection {
	/**
	 * Schema for the root field which contains the whole tree.
	 */
	readonly rootFieldSchema: TreeFieldStoredSchema;
}

/**
 * Collection of TreeNodeSchema data that can be stored in a document.
 *
 * @remarks
 * Note: the owner of this may modify it over time:
 * thus if needing to hang onto a specific version, make a copy.
 * @alpha
 */
export interface StoredSchemaCollection {
	/**
	 * {@inheritdoc StoredSchemaCollection}
	 */
	readonly nodeSchema: ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>;
}
