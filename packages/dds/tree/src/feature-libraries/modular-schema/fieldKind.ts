/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    FieldSchema,
    FieldKindIdentifier,
    TreeSchemaIdentifier,
    SchemaPolicy,
    fieldSchema,
    SchemaData,
} from "../../schema-stored";
import { isNeverField } from "./comparison";
import { FieldChangeHandler, FieldEditor } from "./fieldChangeHandler";

/**
 * Functionality for FieldKinds that is stable,
 * meaning that it can not change in any measurable way without providing a new identifier.
 *
 * It is assumed that this information and policy is available on all clients interacting with a document
 * using the identifier.
 *
 * This must contain enough information to process remote edits to this FieldKind consistently with all clients.
 * All behavior must be deterministic, and not change across versions of the app/library.
 *
 * These policies include the data encoding, change encoding, change rebase and change application.
 *
 * @sealed
 */
export class FieldKind<TEditor extends FieldEditor<any> = FieldEditor<any>> {
    /**
     * @param identifier - Globally scoped identifier.
     * @param multiplicity - bound on the number of children that fields of this kind may have.
     * TODO: replace with numeric upper and lower bounds.
     * @param changeHandler - Change handling policy.
     * @param allowsTreeSupersetOf - returns true iff `superset` supports all that this does
     * and `superset` is an allowed upgrade. Does not have to handle the `never` cases.
     * See {@link isNeverField}.
     * TODO: when used as a method (instead of a free function like the other superset related functions),
     * this name is/signature is confusing and seems backwards.
     * @param handlesEditsFrom - Kinds (in addition to this) whose edits can be processed by changeHandler.
     * If the kind of a field changes, and edits are rebased across that kind change,
     * listing the other old kind here can prevent those edits from being conflicted and
     * provide a chance to handle them.
     */
    public constructor(
        public readonly identifier: FieldKindIdentifier,
        public readonly multiplicity: Multiplicity,
        public readonly changeHandler: FieldChangeHandler<any, TEditor>,
        private readonly allowsTreeSupersetOf: (
            originalTypes: ReadonlySet<TreeSchemaIdentifier> | undefined,
            superset: FieldSchema,
        ) => boolean,
        public readonly handlesEditsFrom: ReadonlySet<FieldKindIdentifier>,
    ) {}

    /**
     * @returns true iff `superset` permits a (non-strict) superset of the subtrees
     * allowed by field made from `this` and `originalTypes`.
     */
    public allowsFieldSuperset(
        policy: FullSchemaPolicy,
        originalData: SchemaData,
        originalTypes: ReadonlySet<TreeSchemaIdentifier> | undefined,
        superset: FieldSchema,
    ): boolean {
        if (isNeverField(policy, originalData, fieldSchema(this, originalTypes))) {
            return true;
        }
        if (isNeverField(policy, originalData, superset)) {
            return false;
        }
        return this.allowsTreeSupersetOf(originalTypes, superset);
    }
}

/**
 * Policy from the app for interpreting the stored schema.
 * The app must ensure consistency for all users of the document.
 */
export interface FullSchemaPolicy extends SchemaPolicy {
    /**
     * Policy information about FieldKinds:
     * This is typically stored as code, not in documents, and defines how to handles fields based on their kind.
     * It is assumed that all users of a document will have exactly the same FieldKind policies,
     * though older applications might be missing some,
     * and will be unable to process any changes that use those FieldKinds.
     */
    readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind>;
}

/**
 * Describes how a particular field functions.
 *
 * This determine its reading and editing APIs, multiplicity, and what merge resolution policies it will use.
 */
export enum Multiplicity {
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
