/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	FieldKindIdentifier,
	FieldKindData,
	Multiplicity,
	SchemaPolicy,
	TreeFieldStoredSchema,
	TreeStoredSchema,
	TreeTypeSet,
} from "../../core/index.js";
import type { MakeNominal } from "../../util/index.js";

import type { FieldChangeHandler, FieldEditor } from "./fieldChangeHandler.js";
import { isNeverField } from "./isNeverTree.js";

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
 * @privateRemarks
 * Using a class gets stronger (nominal) typing for objects which will be down cast.
 */
export class FlexFieldKind<
	// TODO: stronger typing
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	TEditor extends FieldEditor<any> = FieldEditor<any>,
	TName extends string = string,
	TMultiplicity extends Multiplicity = Multiplicity,
> implements FieldKindData
{
	protected _typeCheck!: MakeNominal;

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
		public readonly identifier: TName & FieldKindIdentifier,
		public readonly multiplicity: TMultiplicity,
		// TODO: stronger typing
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		public readonly changeHandler: FieldChangeHandler<any, TEditor>,
		private readonly allowsTreeSupersetOf: (
			originalTypes: TreeTypeSet,
			superset: TreeFieldStoredSchema,
		) => boolean,
		public readonly handlesEditsFrom: ReadonlySet<FieldKindIdentifier>,
	) {}

	/**
	 * Returns true if and only if `superset` permits a (non-strict) superset of the subtrees
	 * allowed by field made from `this` and `originalTypes`.
	 */
	public allowsFieldSuperset(
		policy: SchemaPolicy,
		originalData: TreeStoredSchema,
		originalTypes: TreeTypeSet,
		superset: TreeFieldStoredSchema,
	): boolean {
		if (
			isNeverField(policy, originalData, {
				kind: this.identifier,
				types: originalTypes,
				// Metadata is not used for this check.
				persistedMetadata: undefined,
			})
		) {
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
	readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>;
}
