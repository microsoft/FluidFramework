/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Brand, brand, brandedStringType } from "../../util";

/**
 * Example internal schema representation types.
 */

/**
 * Stable identifier, used when persisting data.
 *
 * This intentionally does not support any concept of versioning or name-spacing:
 * users of it can include versions and namespaces in if they want, or features for them could be added later.
 *
 * Can be used either:
 * 1. Record just this in the persisted data.
 * When loading the data, see if the loader has a schema with a matching name, and if so, use that.
 * Optionally validate loaded data against schema.
 * 2. Persist the whole schema.
 * Use the identifier to associate it with schema when loading to check that the schema match.
 * @alpha
 */
export type SchemaIdentifier = TreeSchemaIdentifier;

/**
 * SchemaIdentifier for a Tree.
 * Also known as "Definition"
 * @alpha
 */
export type TreeSchemaIdentifier = Brand<string, "tree.Schema">;
export const TreeSchemaIdentifierSchema = brandedStringType<TreeSchemaIdentifier>();

/**
 * Key (aka Name or Label) for a field which is scoped to a specific TreeStoredSchema.
 * @alpha
 */
export type FieldKey = Brand<string, "tree.FieldKey">;
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
}

/**
 * {@link ValueSchema} for privative types.
 * @privateRemarks
 * TODO: remove when old editable tree API is removed.
 * @alpha
 */
export type PrimitiveValueSchema = ValueSchema.Number | ValueSchema.String | ValueSchema.Boolean;

/**
 * Set of allowed tree types.
 * Providing multiple values here allows polymorphism, tagged union style.
 *
 * If not specified, types are unconstrained
 * (equivalent to the set containing every TreeSchemaIdentifier defined in the document).
 *
 * Note that even when unconstrained, children must still be in-schema for their own type.
 *
 * In the future, this could be extended to allow inlining a TreeStoredSchema here
 * (or some similar structural schema system).
 * For structural types which could go here, there are a few interesting options:
 *
 * - Allow replacing the whole set with a structural type for terminal / non-tree data,
 * and use this as a replacement for values on the tree nodes.
 *
 * - Allow expression structural constraints for child trees, for example requiring specific traits
 * (ex: via TreeStoredSchema), instead of by type.
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
export type TreeTypeSet = ReadonlySet<TreeSchemaIdentifier> | undefined;

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
export interface FieldStoredSchema {
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
 * 2. The schema used for out of schema fields (which thus must be empty/not exist) on a struct and leaf nodes.
 *
 * @alpha
 */
export const forbiddenFieldKindIdentifier = "Forbidden";

export const storedEmptyFieldSchema: FieldStoredSchema = {
	kind: { identifier: brand(forbiddenFieldKindIdentifier) },
	types: undefined,
};

/**
 * @alpha
 */
export interface TreeStoredSchema {
	/**
	 * Schema for fields with keys scoped to this TreeStoredSchema.
	 *
	 * This refers to the FieldStoredSchema directly
	 * (as opposed to just supporting FieldSchemaIdentifier and having a central FieldKey -\> FieldStoredSchema map).
	 * This allows os short friendly field keys which can ergonomically used as field names in code.
	 * It also interoperates well with mapFields being used as a map with arbitrary data as keys.
	 */
	readonly structFields: ReadonlyMap<FieldKey, FieldStoredSchema>;

	/**
	 * Constraint for fields not mentioned in `structFields`.
	 * If undefined, all such fields must be empty.
	 *
	 * Allows using using the fields as a map, with the keys being
	 * FieldKeys and the values being constrained by this FieldStoredSchema.
	 *
	 * Usually `FieldKind.Value` should NOT be used here
	 * since no nodes can ever be in schema are in schema if you use `FieldKind.Value` here
	 * (that would require infinite children).
	 */
	readonly mapFields?: FieldStoredSchema;

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
 * View of schema data that can be stored in a document.
 *
 * Note: the owner of this may modify it over time:
 * thus if needing to hand onto a specific version, make a copy.
 * @alpha
 */
export interface SchemaData {
	readonly rootFieldSchema: FieldStoredSchema;
	readonly treeSchema: ReadonlyMap<TreeSchemaIdentifier, TreeStoredSchema>;
}
