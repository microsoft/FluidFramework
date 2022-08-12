/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Brand, Opaque } from "../util";

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
 */
export type SchemaIdentifier = GlobalFieldKey | TreeSchemaIdentifier;

/**
 * SchemaIdentifier for a Tree.
 * Also known as "Definition"
 */
export type TreeSchemaIdentifier = Brand<string, "tree.TreeSchemaIdentifier">;

/**
 * Key (aka Name or Label) for a field which is scoped to a specific TreeSchema.
 */
export type LocalFieldKey = Brand<string, "tree.LocalFieldKey">;

/**
 * SchemaIdentifier for a Field "global field",
 * meaning a field which has the same meaning for all usages within the document
 * (not scoped to a specific TreeSchema like LocalFieldKey).
 *
 * Note that the implementations should ensure that GlobalFieldKeys can never collide with LocalFieldKeys.
 * This can be done in several ways
 * (keeping the two classes of fields separate, name-spacing/escaping,
 * compressing one into numbers and leaving the other strings, etc.)
 */
export interface GlobalFieldKey extends Opaque<Brand<string, "tree.GlobalFieldKey">>{}

/**
 * Describes how a particular field functions.
 *
 * This determine its reading and editing APIs, multiplicity, and what merge resolution policies it will use.
 */
export enum FieldKind {
    /**
     * Exactly one item.
     */
    Value,
    /**
     * 0 or 1 items.
     */
    Optional,
    /**
     * 0 or more items.
     */
    Sequence,
    /**
     * Exactly 0 items.
     *
     * Using Forbidden makes what types are listed for allowed in a field irrelevant
     * since the field will never have values in it.
     *
     * Using Forbidden is equivalent to picking a kind that permits empty (like sequence or optional)
     * and having no allowed types (or only never types).
     * Because of this, its possible to express everything constraint wise without Forbidden,
     * but using Forbidden can be more semantically clear than optional with no allowed types.
     *
     * For view schema, this can be useful if you need to:
     * - run a specific out of schema handler when a field is present,
     * but otherwise are ignoring or tolerating (ex: via extra fields) unmentioned fields.
     * - prevent a specific field from being used as an extra field
     * (perhaps for some past of future compatibility reason)
     * - keep a field in a schema for metadata purposes
     * (ex: for improved error messaging, error handling or documentation)
     * that is not used in this specific version of the schema (ex: to document what it was or will be used for).
     *
     * For stored schema, this can be useful if you need to:
     * - have a field which can have its schema updated to Optional or Sequence of any type.
     * - to exclude a field from extra fields
     * - for the schema system to use as a default for fields which aren't declared
     * (ex: when updating a field that did not exist into one that does)
     *
     * See {@link emptyField} for a constant, reusable field using Forbidden.
     */
    Forbidden,
}

/**
 * Example for how we might want to handle values.
 *
 * This might be significantly different if we want to focus more on binary formats
 * (need to work out how Fluid GC would work with that).
 * For now, this is a simple easy to support setup.
 *
 * Note that use of non-Nothing values might be restricted in the actual user facing schema languages:
 * we could instead choose to get by with the only types supporting values being effectively builtin,
 * though this limitation could prevent users for updating/extending
 * the primitive schema to allow the annotations they might want.
 *
 * An interesting alternative to this simple value Enum would be to use something more expressive here, like JsonSchema:
 * since this is modeling immutable data, we really just need a way to figure out which if these value schema allow
 * super sets of each-other.
 *
 * TODO: come up with a final design for how to handle primitives / values.
 * This design is just a placeholder.
 */
export enum ValueSchema {
    Nothing,
    Number,
    String,
    Boolean,
    /**
     * Any Fluid serializable data.
     *
     * This includes Nothing / undefined.
     *
     * If it is desired to not include Nothing here, `anyNode` and `allowsValueSuperset` would need adjusting.
     */
    Serializable,
}

/**
 * Set of allowed tree types.
 * Providing multiple values here allows polymorphism, tagged union style.
 *
 * If not specified, types are unconstrained
 * (equivalent to the set containing every TreeSchemaIdentifier defined in the document).
 *
 * Note that even when unconstrained, children must still be in-schema for their own type.
 *
 * In the future, this could be extended to allow inlining a TreeSchema here
 * (or some similar structural schema system).
 * For structural types which could go here, there are a few interesting options:
 * - Allow replacing the whole set with a structural type for terminal / non-tree data,
 * and use this as a replacement for values on the tree nodes.
 * - Allow expression structural constraints for child trees, for example requiring specific traits
 * (ex: via TreeSchema), instead of by type.
 * There are two ways this could work:
 *      - Constrain the child nodes based on their shape:
 * this makes schema safe editing difficult because nodes would incur extra editing constraints to prevent them
 * from going out of schema based on their location in such a field.
 *      - Constrain the types allowed based on which types guarantee their data will always meet the constraints.
 * Care would need to be taken to make sure this is sound for the schema updating mechanisms.
 */
export type TreeTypeSet = ReadonlySet<TreeSchemaIdentifier> | undefined;

export interface FieldSchema {
    readonly kind: FieldKind;
    /**
     * The set of allowed child types.
     * If not specified, types are unconstrained.
     */
    readonly types?: TreeTypeSet;
}

export interface TreeSchema {
    /**
     * Schema for fields with keys scoped to this TreeSchema.
     *
     * This refers to the FieldSchema directly
     * (as opposed to just supporting FieldSchemaIdentifier and having a central FieldKey -\> FieldSchema map).
     * This allows os short friendly field keys which can ergonomically used as field names in code.
     * It also interoperates well with extraLocalFields being used as a map with arbitrary data as keys.
     */
    readonly localFields: ReadonlyMap<LocalFieldKey, FieldSchema>;

    /**
     * Schema for fields with keys scoped to the whole document.
     *
     * Having a centralized map indexed by FieldSchemaIdentifier
     * can be used for fields which have the same meaning in multiple places,
     * and simplifies document root handling (since the root can just have a special `FieldSchemaIdentifier`).
     */
    readonly globalFields: ReadonlySet<GlobalFieldKey>;

    /**
     * Constraint for local fields not mentioned in `localFields`.
     *
     * Allows using using the local fields as a map, with the keys being
     * LocalFieldKeys and the values being constrained by this FieldSchema.
     *
     * To forbid this map like usage, use {@link emptyField} here.
     *
     * Usually `FieldKind.Value` should NOT be used here
     * since no nodes can ever be in schema are in schema if you use `FieldKind.Value` here
     * (that would require infinite children).
     * This pattern, which produces a schema which can never be met, is used by {@link neverTree},
     * and can be useful in special cases (like a default stored schema when none is specified).
     */
    readonly extraLocalFields: FieldSchema;

    /**
     * If true,
     * GlobalFieldKeys other than the ones listed above in globalFields may be used to store data on this tree node.
     * Such fields must still be in schema with their global FieldSchema.
     *
     * This allows for the "augmentations" pattern where
     * users can attach information they understand to any tree without risk of name collisions.
     * This is not the only way to do "augmentations":
     * another approach is for the applications that wish to add them to include
     * the augmentation in their view schema on the nodes they with to augment,
     * and update the stored schema to permit them as needed.
     *
     * This schema system could work with extraGlobalFields unconditionally on
     * (justified as allowing augmentations everywhere though requiring stored schema changes),
     * or unconditionally off (requiring augmentations to sometimes update stored schema).
     * Simplifying this system to not have extraGlobalFields and default it to on or off is a design decision which
     * doesn't impact the rest of this system,
     * and thus is being put off for now.
     *
     * Unlike with extraLocalFields, only non-empty global fields have to be in schema here,
     * so the existence of a global value field does not immediately make all TreeSchema permitting extra global fields
     * out of schema if they are missing said field.
     *
     * TODO: this approach is inconsistent and should likely be redesigned
     * so global and local extra fields work more similarly.
     */
    readonly extraGlobalFields: boolean;

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
    readonly value: ValueSchema;
}

export interface Named<TName> {
    readonly name: TName;
}

export type NamedTreeSchema = TreeSchema & Named<TreeSchemaIdentifier>;

export interface SchemaRepository {
    /**
     * All fields with the specified GlobalFieldKey must comply with the returned schema.
     */
    lookupGlobalFieldSchema(key: GlobalFieldKey): FieldSchema;

    /**
     * All trees with the specified identifier must comply with the returned schema.
     */
    lookupTreeSchema(identifier: TreeSchemaIdentifier): TreeSchema;

    readonly globalFieldSchema: ReadonlyMap<GlobalFieldKey, FieldSchema>;
    readonly treeSchema: ReadonlyMap<TreeSchemaIdentifier, TreeSchema>;
}
